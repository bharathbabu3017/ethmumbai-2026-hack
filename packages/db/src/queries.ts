import { and, desc, eq, gt, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { calls, copies, follows, linkTokens, orders, pendingActions, traders, users, wallets } from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

interface TelegramProfile {
  id: number;
  username?: string;
}

type MakeWallet = (userId: string) => { address: string; encryptedKey: string };

/** Safe to call concurrently: a user and their bot wallet are only ever created once. */
export async function getOrCreateTelegramUser(db: Db, tg: TelegramProfile, makeWallet: MakeWallet) {
  const [user] = await db
    .insert(users)
    .values({ telegramId: tg.id, telegramUsername: tg.username })
    .onConflictDoUpdate({ target: users.telegramId, set: { telegramUsername: tg.username ?? null } })
    .returning();
  if (!user) throw new Error("Could not load user");

  const existing = await getBotWallet(db, user.id);
  if (existing) return { user, wallet: existing, created: false };

  const inserted = await db
    .insert(wallets)
    .values({ userId: user.id, type: "bot", ...makeWallet(user.id) })
    .onConflictDoNothing()
    .returning();
  const wallet = inserted[0] ?? (await getBotWallet(db, user.id));
  if (!wallet) throw new Error("Could not load wallet");
  return { user, wallet, created: inserted.length > 0 };
}

export async function getBotWallet(db: Db, userId: string) {
  const [wallet] = await db.select().from(wallets).where(and(eq(wallets.userId, userId), eq(wallets.type, "bot")));
  return wallet;
}

export async function createAction(db: Db, userId: string, kind: string, payload: unknown, ttlSeconds = 120) {
  const [action] = await db
    .insert(pendingActions)
    .values({ userId, kind, payload, expiresAt: new Date(Date.now() + ttlSeconds * 1000) })
    .returning({ id: pendingActions.id });
  if (!action) throw new Error("Could not create action");
  return action.id;
}

/** Atomically uses an action. Returns nothing if it is expired, already used, or someone else's. */
export async function claimAction(db: Db, id: string, userId: string) {
  const [action] = await db
    .update(pendingActions)
    .set({ status: "used" })
    .where(
      and(
        eq(pendingActions.id, id),
        eq(pendingActions.userId, userId),
        eq(pendingActions.status, "pending"),
        gt(pendingActions.expiresAt, sql`now()`),
      ),
    )
    .returning();
  return action;
}

export async function recordOrder(db: Db, order: typeof orders.$inferInsert) {
  await db.insert(orders).values(order).onConflictDoNothing();
}

export const findWallet = async (db: Db, address: string) => {
  const [wallet] = await db.select().from(wallets).where(eq(sql`lower(${wallets.address})`, address.toLowerCase()));
  return wallet;
};

/** Finds or creates the user behind a connected web wallet. */
export async function getOrCreateWalletUser(db: Db, address: string) {
  const existing = await findWallet(db, address);
  if (existing) return existing.userId;
  const [user] = await db.insert(users).values({}).returning();
  if (!user) throw new Error("Could not create user");
  const inserted = await db.insert(wallets).values({ userId: user.id, type: "external", address }).onConflictDoNothing().returning();
  if (inserted[0]) return user.id;
  await db.delete(users).where(eq(users.id, user.id)); // lost a race with another request
  const winner = await findWallet(db, address);
  if (!winner) throw new Error("Could not load wallet");
  return winner.userId;
}

export async function createLinkToken(db: Db, token: string, userId: string, ttlSeconds = 600) {
  await db.insert(linkTokens).values({ token, userId, expiresAt: new Date(Date.now() + ttlSeconds * 1000) });
}

/**
 * Links a web account to a Telegram account using a one-time token. The Telegram user is kept,
 * because bot wallet keys are encrypted to that user's id.
 */
export async function linkTelegram(db: Db, token: string, telegramUserId: string) {
  return db.transaction(async (tx) => {
    const [link] = await tx
      .update(linkTokens)
      .set({ usedAt: sql`now()` })
      .where(and(eq(linkTokens.token, token), isNull(linkTokens.usedAt), gt(linkTokens.expiresAt, sql`now()`)))
      .returning();
    if (!link) return "invalid" as const;
    const from = link.userId;
    if (from === telegramUserId) return "linked" as const;

    const [a] = await tx.select().from(traders).where(eq(traders.userId, from));
    const [b] = await tx.select().from(traders).where(eq(traders.userId, telegramUserId));
    if (a && b) return "conflict" as const;

    await tx.update(wallets).set({ userId: telegramUserId }).where(eq(wallets.userId, from));
    await tx.update(orders).set({ userId: telegramUserId }).where(eq(orders.userId, from));
    await tx.update(traders).set({ userId: telegramUserId }).where(eq(traders.userId, from));
    await tx.update(copies).set({ userId: telegramUserId }).where(eq(copies.userId, from));
    const moved = await tx.select().from(follows).where(eq(follows.followerId, from));
    await tx.delete(follows).where(eq(follows.followerId, from));
    if (moved.length) {
      await tx.insert(follows).values(moved.map((f) => ({ ...f, followerId: telegramUserId }))).onConflictDoNothing();
    }
    await tx.update(linkTokens).set({ userId: telegramUserId }).where(eq(linkTokens.userId, from));
    await tx.delete(pendingActions).where(eq(pendingActions.userId, from));
    await tx.delete(users).where(eq(users.id, from));
    return "linked" as const;
  });
}

export const getTraderByUser = async (db: Db, userId: string) => {
  const [trader] = await db.select().from(traders).where(eq(traders.userId, userId));
  return trader;
};

export const getTrader = async (db: Db, id: string) => {
  const [trader] = await db.select().from(traders).where(eq(traders.id, id));
  return trader;
};

export async function createTrader(db: Db, values: typeof traders.$inferInsert) {
  const [trader] = await db.insert(traders).values(values).onConflictDoNothing().returning();
  return trader; // undefined means the name is taken or the user is already a trader
}

export async function createCall(db: Db, values: typeof calls.$inferInsert) {
  const [call] = await db.insert(calls).values(values).onConflictDoNothing().returning();
  return call;
}

export const listCalls = (db: Db, limit = 30) =>
  db
    .select({ call: calls, trader: { id: traders.id, displayName: traders.displayName } })
    .from(calls)
    .innerJoin(traders, eq(calls.traderId, traders.id))
    .orderBy(desc(calls.createdAt))
    .limit(limit);

export const listTraderCalls = (db: Db, traderId: string) =>
  db.select().from(calls).where(eq(calls.traderId, traderId)).orderBy(desc(calls.createdAt)).limit(50);

export const getCallByOrder = async (db: Db, orderId: string) => {
  const [call] = await db.select().from(calls).where(eq(calls.orderId, orderId));
  return call;
};

export const getCallByBracket = async (db: Db, bracketOrderId: string) => {
  const [call] = await db.select().from(calls).where(eq(calls.bracketOrderId, bracketOrderId));
  return call;
};

/** Applies a change only if the status differs, so a replayed stream frame never alerts twice. */
export async function moveCall(db: Db, id: string, change: Partial<typeof calls.$inferInsert> & { status: (typeof calls.$inferInsert)["status"] }) {
  const [call] = await db.update(calls).set(change).where(and(eq(calls.id, id), ne(calls.status, change.status!))).returning();
  return call;
}

export const updateCallFields = (db: Db, id: string, change: Partial<typeof calls.$inferInsert>) =>
  db.update(calls).set(change).where(eq(calls.id, id));

/** Claims calls that have not been announced yet. Each is returned once. */
export const claimUnannouncedCalls = (db: Db) =>
  db.update(calls).set({ alertedAt: sql`now()` }).where(isNull(calls.alertedAt)).returning();

export async function setFollow(db: Db, followerId: string, traderId: string, on: boolean) {
  if (on) await db.insert(follows).values({ followerId, traderId }).onConflictDoNothing();
  else await db.delete(follows).where(and(eq(follows.followerId, followerId), eq(follows.traderId, traderId)));
}

export const isFollowing = async (db: Db, followerId: string, traderId: string) => {
  const [row] = await db.select().from(follows).where(and(eq(follows.followerId, followerId), eq(follows.traderId, traderId)));
  return !!row;
};

/** Telegram chat ids for a trader's followers who want alerts. */
export async function alertRecipients(db: Db, traderId: string) {
  const rows = await db
    .select({ telegramId: users.telegramId })
    .from(follows)
    .innerJoin(users, eq(follows.followerId, users.id))
    .where(and(eq(follows.traderId, traderId), eq(follows.alerts, true), isNotNull(users.telegramId)));
  return rows.map((r) => r.telegramId!);
}

export async function upsertStreamOrder(db: Db, order: { id: string; userId: string; walletId: string; status: string; raw: unknown }) {
  await db.insert(orders).values(order).onConflictDoUpdate({ target: orders.id, set: { status: order.status, raw: order.raw } });
}

const ranked = sql`${calls.status} in ('target_hit', 'stopped_out', 'closed')`;

/** Every number here comes from calls closed by real fills. */
export const leaderboard = (db: Db, traderIds?: string[]) =>
  db
    .select({
      id: traders.id,
      displayName: traders.displayName,
      bio: traders.bio,
      xHandle: traders.xHandle,
      totalCalls: sql<number>`count(${calls.id})::int`,
      closedCalls: sql<number>`(count(${calls.id}) filter (where ${ranked}))::int`,
      wins: sql<number>`(count(${calls.id}) filter (where ${ranked} and ${calls.resultPct} > 0))::int`,
      totalReturn: sql<number>`coalesce(sum(${calls.resultPct}) filter (where ${ranked}), 0)::float`,
      followers: sql<number>`(select count(*) from ${follows} where ${follows.traderId} = ${traders.id})::int`,
    })
    .from(traders)
    .leftJoin(calls, eq(calls.traderId, traders.id))
    .where(traderIds ? inArray(traders.id, traderIds) : undefined)
    .groupBy(traders.id)
    .orderBy(sql`coalesce(sum(${calls.resultPct}) filter (where ${ranked}), 0) desc`);

export const getOrderStatus = async (db: Db, id: string) => {
  const [row] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, id));
  return row?.status ?? undefined;
};

export const getUser = async (db: Db, id: string) => {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
};

export const getCall = async (db: Db, id: string) => {
  const [row] = await db
    .select({ call: calls, trader: { id: traders.id, displayName: traders.displayName, userId: traders.userId } })
    .from(calls)
    .innerJoin(traders, eq(calls.traderId, traders.id))
    .where(eq(calls.id, id));
  return row;
};

export const countCopies = async (db: Db, callId: string) => {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(copies)
    .where(and(eq(copies.callId, callId), eq(copies.status, "placed")));
  return row?.n ?? 0;
};

export const getUserCopy = async (db: Db, callId: string, userId: string) => {
  const [row] = await db.select().from(copies).where(and(eq(copies.callId, callId), eq(copies.userId, userId), eq(copies.status, "placed")));
  return row;
};

const RESERVATION_MINUTES = 5;

/** Reserves a copy. Returns nothing if this wallet already copied the call or has a recent reservation. */
export async function reserveCopy(db: Db, values: typeof copies.$inferInsert) {
  const [row] = await db
    .insert(copies)
    .values(values)
    .onConflictDoUpdate({
      target: [copies.callId, copies.walletId],
      set: { amountUsd: values.amountUsd, stopPrice: values.stopPrice, targetPrice: values.targetPrice, createdAt: sql`now()` },
      setWhere: sql`${copies.status} = 'pending' and ${copies.createdAt} < now() - make_interval(mins => ${RESERVATION_MINUTES})`,
    })
    .returning();
  return row;
}

export const getCopy = async (db: Db, id: string, userId: string) => {
  const [row] = await db.select().from(copies).where(and(eq(copies.id, id), eq(copies.userId, userId)));
  return row;
};

export async function confirmCopy(db: Db, id: string, userId: string, orderId: string) {
  const [row] = await db
    .update(copies)
    .set({ orderId, status: "placed" })
    .where(and(eq(copies.id, id), eq(copies.userId, userId), eq(copies.status, "pending")))
    .returning();
  return row;
}

export const releaseCopy = (db: Db, id: string, userId: string) =>
  db.delete(copies).where(and(eq(copies.id, id), eq(copies.userId, userId), eq(copies.status, "pending")));
