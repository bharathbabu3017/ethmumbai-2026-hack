import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { alias, type PgDatabase, type PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { applyFill } from "./position";
import { agentDecisions, agents, copies, copySettings, copySkips, follows, sentAlerts, linkTokens, mirrors, orders, pendingActions, positions, traders, users, wallets, walletJobs } from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

interface TelegramProfile {
  id: number;
  username?: string;
}

/** The wallet our server may sign with: a Privy wallet the user has approved. */
export async function getTradingWallet(db: Db, userId: string) {
  const [wallet] = await db.select().from(wallets).where(and(eq(wallets.userId, userId), eq(wallets.type, "embedded"), eq(wallets.delegated, true)));
  return wallet;
}

/** Finds or creates a Telegram user. Their wallet comes from Privy. */
export async function getOrCreateTelegramAccount(db: Db, tg: TelegramProfile) {
  const [user] = await db
    .insert(users)
    .values({ telegramId: tg.id, telegramUsername: tg.username })
    .onConflictDoUpdate({ target: users.telegramId, set: { telegramUsername: tg.username ?? null } })
    .returning();
  if (!user) throw new Error("Could not load user");
  return user;
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

/** Moves everything from one account onto another, then removes the empty one. */
async function mergeUsers(tx: Db, from: string, telegramUserId: string) {
    await tx.update(wallets).set({ userId: telegramUserId }).where(eq(wallets.userId, from));
    await tx.update(orders).set({ userId: telegramUserId }).where(eq(orders.userId, from));
    await tx.update(traders).set({ userId: telegramUserId }).where(eq(traders.userId, from));
    await tx.update(copies).set({ userId: telegramUserId }).where(eq(copies.userId, from));
    await tx.update(walletJobs).set({ userId: telegramUserId }).where(eq(walletJobs.userId, from));
    await tx.delete(copySettings).where(eq(copySettings.userId, from));
    await tx.update(mirrors).set({ userId: telegramUserId }).where(eq(mirrors.userId, from));
    await tx.update(mirrors).set({ traderUserId: telegramUserId }).where(eq(mirrors.traderUserId, from));
    const moved = await tx.select().from(follows).where(eq(follows.followerId, from));
    await tx.delete(follows).where(eq(follows.followerId, from));
    if (moved.length) {
      await tx.insert(follows).values(moved.map((f) => ({ ...f, followerId: telegramUserId }))).onConflictDoNothing();
    }
    await tx.update(linkTokens).set({ userId: telegramUserId }).where(eq(linkTokens.userId, from));
    await tx.delete(pendingActions).where(eq(pendingActions.userId, from));
    await tx.delete(users).where(eq(users.id, from));
}

/**
 * Links a web account to a Telegram account using a one-time token.
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

    await mergeUsers(tx as unknown as Db, from, telegramUserId);
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

export async function setFollow(db: Db, followerId: string, traderId: string, on: boolean) {
  if (on) await db.insert(follows).values({ followerId, traderId }).onConflictDoNothing();
  else await db.delete(follows).where(and(eq(follows.followerId, followerId), eq(follows.traderId, traderId)));
}

export const isFollowing = async (db: Db, followerId: string, traderId: string) => {
  const [row] = await db.select().from(follows).where(and(eq(follows.followerId, followerId), eq(follows.traderId, traderId)));
  return !!row;
};

export const setAlertLimits = (db: Db, followerId: string, traderId: string, limits: { minUsd: number | null; maxUsd: number | null }) =>
  db.update(follows).set(limits).where(and(eq(follows.followerId, followerId), eq(follows.traderId, traderId)));

/** Telegram chat ids for a trader's subscribers who want this alert. A trade of unknown size always gets through. */
export async function alertRecipients(db: Db, traderId: string, sizeUsd: number | null = null) {
  const rows = await db
    .select({ telegramId: users.telegramId, minUsd: follows.minUsd, maxUsd: follows.maxUsd })
    .from(follows)
    .innerJoin(users, eq(follows.followerId, users.id))
    .where(and(eq(follows.traderId, traderId), eq(follows.alerts, true), isNotNull(users.telegramId)));
  const wanted = rows.filter((r) => sizeUsd === null || ((r.minUsd === null || sizeUsd >= r.minUsd) && (r.maxUsd === null || sizeUsd <= r.maxUsd)));
  return wanted.map((r) => r.telegramId!);
}

export const getOrder = async (db: Db, id: string) => {
  const [row] = await db.select().from(orders).where(eq(orders.id, id));
  return row;
};

/** Many orders in one round trip, for checks that run often. */
export const getOrders = (db: Db, ids: string[]) => (ids.length ? db.select().from(orders).where(inArray(orders.id, ids)) : Promise.resolve([]));

export const getUser = async (db: Db, id: string) => {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
};

export interface OrderFields {
  id: string;
  userId: string;
  walletId: string;
  isPublic: boolean;
  status: string;
  raw: unknown;
  side: string;
  orderType: string;
  chain: string;
  tokenSymbol: string;
  tokenAddress: string;
  qty: string;
  limitPrice: number | null;
  stopPrice: number | null;
  targetPrice: number | null;
  entryOrderId: string | null;
  filledQty: number;
  filledUsd: number;
  usdPriced: boolean; // false when the other side isn't USDC, so a fill has no reliable USD value
  placedAt: Date | null;
}

/**
 * Records a stream frame and applies any new fill to the wallet's position, once.
 * Replaying a frame changes nothing, because only the amount above what was already applied counts.
 */
export async function applyOrderFrame(db: Db, frame: OrderFields) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(orders).where(eq(orders.id, frame.id));
    const newQty = frame.filledQty - (before?.filledQty ?? 0);
    const newUsd = frame.filledUsd - (before?.filledUsd ?? 0);
    let realizedUsd = before?.realizedUsd ?? 0;
    let soldCostUsd = before?.soldCostUsd ?? 0;
    let heldBeforeSell = before?.heldBeforeSell ?? null;

    if (newQty > 0 && frame.usdPriced) {
      const key = and(eq(positions.walletId, frame.walletId), eq(positions.tokenAddress, frame.tokenAddress));
      const [held] = await tx.select().from(positions).where(key);
      if (frame.side === "sell" && heldBeforeSell === null) heldBeforeSell = held?.qty ?? 0;
      const result = applyFill(held ?? { qty: 0, costUsd: 0 }, frame.side, newQty, newUsd);
      await tx
        .insert(positions)
        .values({ walletId: frame.walletId, tokenAddress: frame.tokenAddress, tokenSymbol: frame.tokenSymbol, ...result.position })
        .onConflictDoUpdate({ target: [positions.walletId, positions.tokenAddress], set: result.position });
      realizedUsd += result.realizedUsd;
      soldCostUsd += result.soldCostUsd;
    }

    const { usdPriced: _usdPriced, ...row } = frame;
    const values = {
      ...row,
      // A frame can't remove a level or fill we already know about.
      stopPrice: frame.stopPrice ?? before?.stopPrice ?? null,
      targetPrice: frame.targetPrice ?? before?.targetPrice ?? null,
      filledQty: Math.max(frame.filledQty, before?.filledQty ?? 0),
      filledUsd: Math.max(frame.filledUsd, before?.filledUsd ?? 0),
      // The bot saves a bare row first, so visibility is only fixed once a frame has been applied.
      isPublic: before?.side ? before.isPublic : frame.isPublic,
      realizedUsd,
      soldCostUsd,
      heldBeforeSell,
    };
    const [order] = await tx.insert(orders).values(values).onConflictDoUpdate({ target: orders.id, set: values }).returning();
    return { order: order!, previousStatus: before?.status ?? undefined, seenBefore: !!before?.side };
  });
}

const trade = {
  order: orders,
  trader: { id: traders.id, displayName: traders.displayName, userId: traders.userId },
};

export const listTrades = (db: Db, limit = 30) =>
  db.select(trade).from(orders).innerJoin(traders, eq(orders.userId, traders.userId)).where(eq(orders.isPublic, true)).orderBy(desc(orders.placedAt)).limit(limit);

export const listTraderTrades = (db: Db, userId: string) =>
  db.select().from(orders).where(and(eq(orders.userId, userId), eq(orders.isPublic, true))).orderBy(desc(orders.placedAt)).limit(50);

export const getTrade = async (db: Db, orderId: string) => {
  const [row] = await db.select(trade).from(orders).innerJoin(traders, eq(orders.userId, traders.userId)).where(and(eq(orders.id, orderId), eq(orders.isPublic, true)));
  return row;
};

/** What a wallet paid for what it holds, and what it has made or lost on everything it sold. */
export async function walletPnl(db: Db, walletId: string) {
  const [held, [sold]] = await Promise.all([
    db.select({ tokenAddress: positions.tokenAddress, qty: positions.qty, costUsd: positions.costUsd }).from(positions).where(eq(positions.walletId, walletId)),
    db.select({ usd: sql<number>`coalesce(sum(${orders.realizedUsd}), 0)::float` }).from(orders).where(eq(orders.walletId, walletId)),
  ]);
  return { positions: held, realizedUsd: sold?.usd ?? 0 };
}

/** The latest public buy of a token by each trader. */
export async function tokenTraders(db: Db, tokenAddress: string) {
  const rows = await db
    .select({ orderId: orders.id, traderId: traders.id, userId: traders.userId, displayName: traders.displayName, filledUsd: orders.filledUsd, filledQty: orders.filledQty, placedAt: orders.placedAt })
    .from(orders)
    .innerJoin(traders, eq(orders.userId, traders.userId))
    .where(and(eq(orders.isPublic, true), eq(orders.side, "buy"), gt(orders.filledUsd, 0), sql`lower(${orders.tokenAddress}) = ${tokenAddress.toLowerCase()}`))
    .orderBy(desc(orders.placedAt))
    .limit(20);
  return [...new Map(rows.reverse().map((r) => [r.traderId, r])).values()].reverse().slice(0, 5);
}

export const getPosition = async (db: Db, walletId: string, tokenAddress: string) => {
  const [row] = await db.select().from(positions).where(and(eq(positions.walletId, walletId), eq(positions.tokenAddress, tokenAddress)));
  return row;
};

/** Every number here comes from fills. Return is profit on what was sold, divided by what it cost. */
export const leaderboard = (db: Db, traderIds?: string[]) =>
  db
    .select({
      id: traders.id,
      userId: traders.userId,
      displayName: traders.displayName,
      bio: traders.bio,
      xHandle: traders.xHandle,
      trades: sql<number>`(count(${orders.id}) filter (where ${orders.filledQty} > 0))::int`,
      closed: sql<number>`(count(${orders.id}) filter (where ${orders.soldCostUsd} > 0))::int`,
      wins: sql<number>`(count(${orders.id}) filter (where ${orders.realizedUsd} > 0))::int`,
      realizedUsd: sql<number>`coalesce(sum(${orders.realizedUsd}), 0)::float`,
      soldCostUsd: sql<number>`coalesce(sum(${orders.soldCostUsd}), 0)::float`,
      followers: sql<number>`(select count(*) from ${follows} where ${follows.traderId} = ${traders.id})::int`,
      copiers: sql<number>`(select count(distinct ${copies.userId}) from ${copies} where ${copies.status} = 'placed' and ${copies.sourceOrderId} in (select o.id from orders o where o.user_id = ${traders.userId}))::int`,
      walletAddress: sql<string | null>`(select ${wallets.address} from ${wallets} where ${wallets.userId} = ${traders.userId} order by (${wallets.type} = 'external') desc limit 1)`,
    })
    .from(traders)
    .leftJoin(orders, and(eq(orders.userId, traders.userId), eq(orders.isPublic, true)))
    .where(traderIds ? inArray(traders.id, traderIds) : undefined)
    .groupBy(traders.id)
    .orderBy(sql`coalesce(sum(${orders.realizedUsd}) / nullif(sum(${orders.soldCostUsd}), 0), 0) desc`);

export const countCopies = async (db: Db, sourceOrderId: string) => {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(copies)
    .where(and(eq(copies.sourceOrderId, sourceOrderId), eq(copies.status, "placed")));
  return row?.n ?? 0;
};

export const getUserCopy = async (db: Db, sourceOrderId: string, userId: string) => {
  const [row] = await db.select().from(copies).where(and(eq(copies.sourceOrderId, sourceOrderId), eq(copies.userId, userId), eq(copies.status, "placed")));
  return row;
};

const RESERVATION_MINUTES = 5;

/** Reserves a copy. Returns nothing if this wallet already copied the trade or has a recent reservation. */
export async function reserveCopy(db: Db, values: typeof copies.$inferInsert) {
  const [row] = await db
    .insert(copies)
    .values(values)
    .onConflictDoUpdate({
      target: [copies.sourceOrderId, copies.walletId],
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

export const recordCopySkip = (db: Db, skip: { sourceOrderId: string; userId: string; reason: string }) =>
  db.insert(copySkips).values(skip).onConflictDoNothing();

/** Frees a copy nothing was placed for. With a reason, it stays in the follower's history as skipped. */
export async function releaseCopy(db: Db, id: string, userId: string, reason?: string) {
  const [row] = await db.delete(copies).where(and(eq(copies.id, id), eq(copies.userId, userId), eq(copies.status, "pending"))).returning();
  if (row && reason) await recordCopySkip(db, { sourceOrderId: row.sourceOrderId, userId, reason });
}

export const listFollowing = (db: Db, userId: string) =>
  db
    .select({ id: traders.id, displayName: traders.displayName, minUsd: follows.minUsd, maxUsd: follows.maxUsd })
    .from(follows)
    .innerJoin(traders, eq(follows.traderId, traders.id))
    .where(eq(follows.followerId, userId));

export const listUserCopies = (db: Db, userId: string) =>
  db
    .select({
      id: copies.id,
      amountUsd: copies.amountUsd,
      sourceOrderId: copies.sourceOrderId,
      tokenSymbol: orders.tokenSymbol,
      trader: traders.displayName,
      traderId: traders.id,
    })
    .from(copies)
    .innerJoin(orders, eq(copies.sourceOrderId, orders.id))
    .innerJoin(traders, eq(orders.userId, traders.userId))
    .where(and(eq(copies.userId, userId), eq(copies.status, "placed")))
    .orderBy(desc(copies.createdAt))
    .limit(50);

export const findWalletById = async (db: Db, id: string) => {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.id, id));
  return wallet;
};

export const getUserByTelegram = async (db: Db, telegramId: number) => {
  const [user] = await db.select().from(users).where(eq(users.telegramId, telegramId));
  return user;
};

export async function enqueueJob(db: Db, values: { userId: string; walletId: string; kind: string; payload: unknown }) {
  const [job] = await db.insert(walletJobs).values(values).returning({ id: walletJobs.id });
  return job!.id;
}

export const getJob = async (db: Db, id: string, userId: string) => {
  const [job] = await db.select().from(walletJobs).where(and(eq(walletJobs.id, id), eq(walletJobs.userId, userId)));
  return job;
};

/** Whether a withdrawal for this wallet is still going, so a double click can't send twice. */
export async function withdrawalPending(db: Db, walletId: string) {
  const [row] = await db
    .select({ id: walletJobs.id })
    .from(walletJobs)
    .where(and(eq(walletJobs.walletId, walletId), inArray(walletJobs.kind, ["agent-withdraw", "agent-exit"]), inArray(walletJobs.status, ["queued", "running"])))
    .limit(1);
  return !!row;
}

const JOB_MAX_AGE_SECONDS = 60;
// Far longer than any job takes, so only one cut off by a crash gets here.
const RUNNING_JOB_MAX_AGE_MINUTES = 15;

/** Takes queued jobs for one worker. Each job is only ever claimed once, and an old one is never run late. */
export async function claimJobs(db: Db, limit = 10) {
  await db
    .update(walletJobs)
    .set({ status: "failed", error: "This request timed out. Nothing was placed." })
    .where(and(eq(walletJobs.status, "queued"), sql`${walletJobs.createdAt} < now() - make_interval(secs => ${JOB_MAX_AGE_SECONDS})`));
  // It may have reached Flash before it stopped, so it's reported and never run again.
  await db
    .update(walletJobs)
    .set({ status: "failed", error: "This request was interrupted. Check your orders before trying again." })
    .where(and(eq(walletJobs.status, "running"), sql`${walletJobs.createdAt} < now() - make_interval(mins => ${RUNNING_JOB_MAX_AGE_MINUTES})`));
  return db
    .update(walletJobs)
    .set({ status: "running" })
    .where(
      inArray(
        walletJobs.id,
        db.select({ id: walletJobs.id }).from(walletJobs).where(eq(walletJobs.status, "queued")).orderBy(walletJobs.createdAt).limit(limit).for("update", { skipLocked: true }),
      ),
    )
    .returning();
}

export const finishJob = (db: Db, id: string, outcome: { result: unknown } | { error: string }) =>
  db
    .update(walletJobs)
    .set("error" in outcome ? { status: "failed", error: outcome.error } : { status: "done", result: outcome.result })
    .where(eq(walletJobs.id, id));

const DUST = 1e-9;
const MIRROR_RESERVATION_MINUTES = 5;
const copyOrder = alias(orders, "copy_order");
const sourceOrder = alias(orders, "source_order");
const ownOrder = alias(orders, "own_order");

/** Reserves an alert for a chat. Only the first caller for a key gets true, so nothing is sent twice. */
export async function claimAlert(db: Db, chatId: number, key: string) {
  const rows = await db.insert(sentAlerts).values({ chatId, key }).onConflictDoNothing().returning({ key: sentAlerts.key });
  return rows.length > 0;
}

export const pruneAlerts = (db: Db) => db.delete(sentAlerts).where(sql`${sentAlerts.createdAt} < now() - interval '30 days'`);

export const getTraderByName = async (db: Db, displayName: string) => {
  const [row] = await db.select().from(traders).where(sql`lower(${traders.displayName}) = ${displayName.toLowerCase()}`);
  return row;
};

export const countAgents = async (db: Db, ownerId: string) => {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(agents).where(and(eq(agents.ownerId, ownerId), sql`${agents.status} <> 'stopped'`));
  return row?.n ?? 0;
};

/** An agent gets its own user, approved wallet and public trader profile, so everything built for traders works for it. */
export function createAgent(db: Db, a: { ownerId: string; name: string; settings: unknown; address: string; privyWalletId: string }) {
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({}).returning();
    const [wallet] = await tx.insert(wallets).values({ userId: user!.id, type: "embedded", address: a.address, privyWalletId: a.privyWalletId, delegated: true }).returning();
    const [trader] = await tx.insert(traders).values({ userId: user!.id, displayName: a.name }).returning();
    const [agent] = await tx.insert(agents).values({ ownerId: a.ownerId, userId: user!.id, traderId: trader!.id, walletId: wallet!.id, settings: a.settings }).returning();
    return { ...agent!, displayName: a.name, address: a.address };
  });
}

export const listAgents = (db: Db, ownerId: string) =>
  db
    .select({ id: agents.id, traderId: agents.traderId, status: agents.status, settings: agents.settings, displayName: traders.displayName, address: wallets.address, createdAt: agents.createdAt })
    .from(agents)
    .innerJoin(traders, eq(agents.traderId, traders.id))
    .innerJoin(wallets, eq(agents.walletId, wallets.id))
    .where(and(eq(agents.ownerId, ownerId), isNull(agents.removedAt)))
    .orderBy(desc(agents.createdAt));

export const getOwnedAgent = async (db: Db, id: string, ownerId: string) => {
  const [row] = await db.select().from(agents).where(and(eq(agents.id, id), eq(agents.ownerId, ownerId)));
  return row;
};

export const getAgentByTrader = async (db: Db, traderId: string) => {
  const [row] = await db.select().from(agents).where(eq(agents.traderId, traderId));
  return row;
};

export const getAgentByUser = async (db: Db, userId: string) => {
  const [row] = await db.select().from(agents).where(eq(agents.userId, userId));
  return row;
};

export const setAgentStatus = (db: Db, id: string, status: "funding" | "running" | "paused" | "stopped") => db.update(agents).set({ status }).where(eq(agents.id, id));

/** Takes it off the owner's list and Discover. Its trades and decisions are kept, because a public record stays honest. */
export const removeAgent = (db: Db, id: string) => db.update(agents).set({ status: "stopped", removedAt: new Date() }).where(eq(agents.id, id));

/** Which traders are agents, for badges and the Agents tab. */
export const listAgentTraders = (db: Db) => db.select({ traderId: agents.traderId, status: agents.status, settings: agents.settings, removedAt: agents.removedAt }).from(agents);

/** Agents that might need a check, with what the runner needs to act for them. */
export const activeAgents = (db: Db) =>
  db
    .select({ id: agents.id, userId: agents.userId, walletId: agents.walletId, traderId: agents.traderId, status: agents.status, settings: agents.settings, lastCheckAt: agents.lastCheckAt, address: wallets.address })
    .from(agents)
    .innerJoin(wallets, eq(agents.walletId, wallets.id))
    .where(inArray(agents.status, ["funding", "running"]));

/** Claims this check, so two workers can never run it at once. */
export async function claimAgentCheck(db: Db, id: string, seen: Date | null) {
  const rows = await db
    .update(agents)
    .set({ lastCheckAt: new Date() })
    .where(and(eq(agents.id, id), seen ? eq(agents.lastCheckAt, seen) : isNull(agents.lastCheckAt)))
    .returning({ id: agents.id });
  return rows.length > 0;
}

export async function recordDecision(db: Db, d: typeof agentDecisions.$inferInsert) {
  const [row] = await db.insert(agentDecisions).values(d).returning();
  return row!;
}

/** With an amount, only that part failed, so the rest of a multi-order decision still counts against the budget. */
export const failDecision = (db: Db, id: string, note: string, amountUsd?: number) =>
  db
    .update(agentDecisions)
    .set(amountUsd
      ? { note, amountUsd: sql`greatest(${agentDecisions.amountUsd} - ${amountUsd}, 0)`, status: sql`case when ${agentDecisions.amountUsd} - ${amountUsd} > 0.001 then 'placed'::decision_status else 'failed'::decision_status end` }
      : { status: "failed", note })
    .where(eq(agentDecisions.id, id));

/** When it last acted on a token, to space out buys and avoid placing the same exit twice. */
export async function lastDecisionAt(db: Db, agentId: string, action: string, tokenSymbol: string) {
  const [row] = await db
    .select({ at: agentDecisions.createdAt })
    .from(agentDecisions)
    .where(and(eq(agentDecisions.agentId, agentId), eq(agentDecisions.action, action), eq(agentDecisions.tokenSymbol, tokenSymbol), sql`${agentDecisions.status} in ('placed', 'failed')`))
    .orderBy(desc(agentDecisions.createdAt))
    .limit(1);
  return row?.at ?? null;
}

/** How many public traders bought a token lately, leaving out the agent asking. */
export async function recentBuyers(db: Db, tokenAddress: string, since: Date, exceptUserId?: string) {
  const [row] = await db
    .select({ count: sql<number>`count(distinct ${orders.userId})::int` })
    .from(orders)
    .where(and(eq(orders.isPublic, true), eq(orders.side, "buy"), sql`${orders.filledQty} > 0`, sql`lower(${orders.tokenAddress}) = ${tokenAddress.toLowerCase()}`, gte(orders.placedAt, since), exceptUserId ? ne(orders.userId, exceptUserId) : undefined));
  return row?.count ?? 0;
}

/** What an agent has committed so far. Failed orders don't count, and sales never use budget. */
export async function agentSpentUsd(db: Db, agentId: string) {
  const [row] = await db
    .select({ usd: sql<number>`coalesce(sum(${agentDecisions.amountUsd}), 0)::float` })
    .from(agentDecisions)
    .where(and(eq(agentDecisions.agentId, agentId), eq(agentDecisions.status, "placed"), sql`${agentDecisions.action} <> 'sell'`));
  return row?.usd ?? 0;
}

export const listDecisions = (db: Db, agentId: string, limit = 30) =>
  db.select().from(agentDecisions).where(eq(agentDecisions.agentId, agentId)).orderBy(desc(agentDecisions.createdAt)).limit(limit);

/** Whether an address belongs to the agent's owner, the only place its funds may go. */
export async function ownsAgentDestination(db: Db, agentUserId: string, address: string) {
  const [row] = await db
    .select({ id: wallets.id })
    .from(agents)
    .innerJoin(wallets, eq(wallets.userId, agents.ownerId))
    .where(and(eq(agents.userId, agentUserId), sql`lower(${wallets.address}) = ${address.toLowerCase()}`));
  return !!row;
}

/** Auto-copies of a trade, with the state of each copy's own order. */
export const autoCopiesOf = (db: Db, sourceOrderId: string) =>
  db
    .select({ userId: copies.userId, walletId: copies.walletId, orderId: copies.orderId, status: ownOrder.status })
    .from(copies)
    .innerJoin(ownOrder, eq(copies.orderId, ownOrder.id))
    .where(and(eq(copies.sourceOrderId, sourceOrderId), eq(copies.auto, true), eq(copies.status, "placed")));

/** Whose trade an order was copied from, if it's a copy or a mirrored sale. */
export async function copyContext(db: Db, orderId: string) {
  const [copy] = await db
    .select({ trader: traders.displayName })
    .from(copies)
    .innerJoin(sourceOrder, eq(copies.sourceOrderId, sourceOrder.id))
    .innerJoin(traders, eq(sourceOrder.userId, traders.userId))
    .where(and(eq(copies.orderId, orderId), eq(copies.auto, true)));
  if (copy) return copy.trader;
  const [mirror] = await db
    .select({ trader: traders.displayName })
    .from(mirrors)
    .innerJoin(traders, eq(mirrors.traderUserId, traders.userId))
    .where(eq(mirrors.orderId, orderId));
  return mirror?.trader;
}

/** Copies of a trader's trades. Copiers stay anonymous here. */
export const copiesOfTrader = (db: Db, traderUserId: string) =>
  db
    .select({ id: copies.id, tokenSymbol: sourceOrder.tokenSymbol, amountUsd: copies.amountUsd, auto: copies.auto, createdAt: copies.createdAt })
    .from(copies)
    .innerJoin(sourceOrder, eq(copies.sourceOrderId, sourceOrder.id))
    .where(and(eq(sourceOrder.userId, traderUserId), eq(copies.status, "placed")))
    .orderBy(desc(copies.createdAt))
    .limit(50);

/** Everything copied for a user, newest first: buys, sales that mirrored the trader, and skips with their reason. */
export async function copyHistory(db: Db, userId: string) {
  const fill = { orderStatus: ownOrder.status, filledUsd: ownOrder.filledUsd, filledQty: ownOrder.filledQty };
  const who = { trader: traders.displayName, traderId: traders.id };
  const [buys, sales, skips] = await Promise.all([
    db
      .select({ id: copies.id, sourceOrderId: copies.sourceOrderId, tokenSymbol: sourceOrder.tokenSymbol, tokenAddress: sourceOrder.tokenAddress, amountUsd: copies.amountUsd, auto: copies.auto, createdAt: copies.createdAt, ...who, ...fill })
      .from(copies)
      .innerJoin(sourceOrder, eq(copies.sourceOrderId, sourceOrder.id))
      .innerJoin(traders, eq(sourceOrder.userId, traders.userId))
      .leftJoin(ownOrder, eq(copies.orderId, ownOrder.id))
      .where(and(eq(copies.userId, userId), or(eq(copies.status, "placed"), eq(copies.auto, true))))
      .orderBy(desc(copies.createdAt))
      .limit(50),
    db
      .select({ id: mirrors.id, sourceOrderId: mirrors.sellOrderId, tokenSymbol: mirrors.tokenSymbol, tokenAddress: mirrors.tokenAddress, percent: mirrors.percent, createdAt: mirrors.createdAt, ...who, ...fill })
      .from(mirrors)
      .innerJoin(traders, eq(mirrors.traderUserId, traders.userId))
      .leftJoin(ownOrder, eq(mirrors.orderId, ownOrder.id))
      .where(and(eq(mirrors.userId, userId), eq(mirrors.status, "placed")))
      .orderBy(desc(mirrors.createdAt))
      .limit(50),
    db
      .select({ id: copySkips.id, sourceOrderId: copySkips.sourceOrderId, tokenSymbol: sourceOrder.tokenSymbol, tokenAddress: sourceOrder.tokenAddress, reason: copySkips.reason, createdAt: copySkips.createdAt, ...who })
      .from(copySkips)
      .innerJoin(sourceOrder, eq(copySkips.sourceOrderId, sourceOrder.id))
      .innerJoin(traders, eq(sourceOrder.userId, traders.userId))
      .where(eq(copySkips.userId, userId))
      .orderBy(desc(copySkips.createdAt))
      .limit(50),
  ]);
  return [
    ...buys.map((r) => ({ ...r, kind: "buy" as const })),
    ...sales.map((r) => ({ ...r, kind: "sell" as const })),
    ...skips.map((r) => ({ ...r, kind: "skip" as const })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 50);
}

/** What a wallet still holds from copying this trader in this token: never more than it actually holds. */
async function copiedHoldings(db: Db, traderUserId: string, tokenAddress: string) {
  const rows = await db
    .select({ walletId: copies.walletId, userId: copies.userId, filled: sql<number>`sum(${copyOrder.filledQty})::float` })
    .from(copies)
    .innerJoin(sourceOrder, eq(copies.sourceOrderId, sourceOrder.id))
    .innerJoin(copyOrder, eq(copies.orderId, copyOrder.id))
    .where(and(eq(copies.status, "placed"), eq(sourceOrder.userId, traderUserId), eq(sourceOrder.tokenAddress, tokenAddress)))
    .groupBy(copies.walletId, copies.userId);

  const holdings = [];
  for (const row of rows) {
    const [sold] = await db
      .select({ qty: sql<number>`coalesce(sum(${mirrors.qty}), 0)::float` })
      .from(mirrors)
      .where(and(eq(mirrors.walletId, row.walletId), eq(mirrors.tokenAddress, tokenAddress), eq(mirrors.traderUserId, traderUserId), eq(mirrors.status, "placed")));
    const held = (await getPosition(db, row.walletId, tokenAddress))?.qty ?? 0;
    holdings.push({ ...row, qty: Math.min(row.filled - (sold?.qty ?? 0), held) });
  }
  return holdings.filter((h) => h.qty > DUST);
}

/** Creates one prompt per follower for a finished trader sale. Running it twice creates nothing new. */
export async function createMirrors(db: Db, sell: typeof orders.$inferSelect) {
  if (!sell.tokenAddress || !sell.tokenSymbol || !sell.heldBeforeSell || sell.filledQty <= 0) return [];
  const share = Math.min(1, sell.filledQty / sell.heldBeforeSell);
  const created = [];
  for (const h of await copiedHoldings(db, sell.userId, sell.tokenAddress)) {
    const [row] = await db
      .insert(mirrors)
      .values({
        sellOrderId: sell.id, traderUserId: sell.userId, userId: h.userId, walletId: h.walletId,
        tokenAddress: sell.tokenAddress, tokenSymbol: sell.tokenSymbol, percent: share * 100, qty: h.qty * share,
      })
      .onConflictDoNothing()
      .returning();
    if (row) created.push(row);
  }
  return created;
}

export const listMirrors = (db: Db, userId: string) =>
  db
    .select({ mirror: mirrors, trader: traders.displayName, walletAddress: wallets.address, walletType: wallets.type })
    .from(mirrors)
    .innerJoin(traders, eq(mirrors.traderUserId, traders.userId))
    .innerJoin(wallets, eq(mirrors.walletId, wallets.id))
    .where(and(eq(mirrors.userId, userId), eq(mirrors.status, "pending")))
    .orderBy(desc(mirrors.createdAt));

/** Orders from this wallet's copies of a token that hold a stop and target pair. */
export const listCopyOrders = (db: Db, walletId: string, tokenAddress: string) =>
  db
    .select({ order: copyOrder })
    .from(copies)
    .innerJoin(sourceOrder, eq(copies.sourceOrderId, sourceOrder.id))
    .innerJoin(copyOrder, eq(copies.orderId, copyOrder.id))
    .where(and(eq(copies.walletId, walletId), eq(sourceOrder.tokenAddress, tokenAddress), eq(copies.status, "placed")));

/** Reserves a prompt while the sale runs, so it can't be acted on twice. An abandoned attempt can be retried later. */
export async function claimMirror(db: Db, id: string, userId: string) {
  const [row] = await db
    .update(mirrors)
    .set({ status: "executing", updatedAt: sql`now()` })
    .where(
      and(
        eq(mirrors.id, id),
        eq(mirrors.userId, userId),
        sql`(${mirrors.status} = 'pending' or (${mirrors.status} = 'executing' and ${mirrors.updatedAt} < now() - make_interval(mins => ${MIRROR_RESERVATION_MINUTES})))`,
      ),
    )
    .returning();
  return row;
}

export async function completeMirror(db: Db, id: string, userId: string, orderId: string) {
  const [row] = await db
    .update(mirrors)
    .set({ status: "placed", orderId })
    .where(and(eq(mirrors.id, id), eq(mirrors.userId, userId), eq(mirrors.status, "executing")))
    .returning();
  return row;
}

export const releaseMirror = (db: Db, id: string, userId: string) =>
  db.update(mirrors).set({ status: "pending" }).where(and(eq(mirrors.id, id), eq(mirrors.userId, userId), eq(mirrors.status, "executing")));

export const dismissMirror = (db: Db, id: string, userId: string) =>
  db.update(mirrors).set({ status: "dismissed" }).where(and(eq(mirrors.id, id), eq(mirrors.userId, userId), eq(mirrors.status, "pending")));

export const getMirror = async (db: Db, id: string, userId: string) => {
  const [row] = await db.select().from(mirrors).where(and(eq(mirrors.id, id), eq(mirrors.userId, userId)));
  return row;
};

export const getCopySettings = async (db: Db, userId: string, traderId: string) => {
  const [row] = await db.select().from(copySettings).where(and(eq(copySettings.userId, userId), eq(copySettings.traderId, traderId)));
  return row?.settings;
};

export async function saveCopySettings(db: Db, userId: string, traderId: string, settings: { enabled: boolean }) {
  await db
    .insert(copySettings)
    .values({ userId, traderId, settings, enabled: settings.enabled })
    .onConflictDoUpdate({ target: [copySettings.userId, copySettings.traderId], set: { settings, enabled: settings.enabled, updatedAt: sql`now()` } });
}

export const listAutoCopiers = (db: Db, traderId: string) =>
  db
    .select({ userId: copySettings.userId, settings: copySettings.settings, telegramId: users.telegramId, paused: users.copyPaused })
    .from(copySettings)
    .innerJoin(users, eq(copySettings.userId, users.id))
    .where(and(eq(copySettings.traderId, traderId), eq(copySettings.enabled, true)));

export const listUserCopySettings = (db: Db, userId: string) =>
  db
    .select({ traderId: traders.id, traderUserId: traders.userId, displayName: traders.displayName, settings: copySettings.settings, enabled: copySettings.enabled })
    .from(copySettings)
    .innerJoin(traders, eq(copySettings.traderId, traders.id))
    .where(eq(copySettings.userId, userId));

export const setCopyPaused = (db: Db, userId: string, paused: boolean) => db.update(users).set({ copyPaused: paused }).where(eq(users.id, userId));

/** What auto-copy has committed in the last 24 hours, including copies still being placed. */
export async function autoSpentLast24h(db: Db, userId: string, sourceUserId: string) {
  const [row] = await db
    .select({ usd: sql<number>`coalesce(sum(${copies.amountUsd}), 0)::float` })
    .from(copies)
    .innerJoin(sourceOrder, eq(copies.sourceOrderId, sourceOrder.id))
    .where(and(eq(copies.userId, userId), eq(copies.auto, true), eq(sourceOrder.userId, sourceUserId), sql`${copies.createdAt} > now() - interval '24 hours'`));
  return row?.usd ?? 0;
}

/** True if this order came from copying someone, so copying it would start a chain. */
export async function isCopyOrder(db: Db, order: { id: string; walletId: string }) {
  const [row] = await db
    .select({ id: copies.id })
    .from(copies)
    .where(and(eq(copies.walletId, order.walletId), sql`(${copies.orderId} = ${order.id} or (${copies.status} = 'pending' and ${copies.createdAt} > now() - interval '2 minutes'))`))
    .limit(1);
  return !!row;
}

/** The open stop and target pairs behind a wallet's copied position, for selling. */
export async function mirrorExits(db: Db, walletId: string, tokenAddress: string, openStatuses: string[]) {
  const pairOrderIds: string[] = [];
  let stop: number | null = null;
  let target: number | null = null;
  for (const { order } of await listCopyOrders(db, walletId, tokenAddress)) {
    const pairId = (order.raw as { attachedBracket?: { bracketOrderId?: string | null } } | null)?.attachedBracket?.bracketOrderId;
    const pair = pairId ? await getOrder(db, pairId) : undefined;
    if (!pairId || !openStatuses.includes(pair?.status ?? "")) continue;
    pairOrderIds.push(pairId);
    stop = pair?.stopPrice ?? order.stopPrice;
    target = pair?.targetPrice ?? order.targetPrice;
  }
  return { pairOrderIds, stop, target };
}

export interface PrivyIdentity {
  privyId: string;
  telegramId?: number;
  telegramUsername?: string;
  embedded?: { walletId: string; address: string; delegated: boolean };
  externalAddresses: string[];
}

/**
 * Connects a verified Privy user to one Flashmob account, merging any accounts that turn out to be the same person.
 */
export async function syncPrivyUser(db: Db, identity: PrivyIdentity) {
  return db.transaction(async (raw) => {
    const tx = raw as unknown as Db;
    const addresses = [...identity.externalAddresses, ...(identity.embedded ? [identity.embedded.address] : [])];
    const ids = new Set<string>();
    const [byPrivy] = await tx.select().from(users).where(eq(users.privyId, identity.privyId));
    if (byPrivy) ids.add(byPrivy.id);
    const byTelegram = identity.telegramId ? await getUserByTelegram(tx, identity.telegramId) : undefined;
    if (byTelegram) ids.add(byTelegram.id);
    for (const address of addresses) {
      const wallet = await findWallet(tx, address);
      if (wallet) ids.add(wallet.userId);
    }

    let userId = byTelegram?.id ?? [...ids][0];
    if (!userId) {
      const [created] = await tx.insert(users).values({}).returning();
      userId = created!.id;
    }
    for (const other of ids) {
      if (other === userId) continue;
      const [a] = await tx.select().from(traders).where(eq(traders.userId, other));
      const [b] = await tx.select().from(traders).where(eq(traders.userId, userId));
      if (a && b) continue; // two trader profiles can't be merged, so they stay separate
      await mergeUsers(tx, other, userId);
    }

    await tx
      .update(users)
      .set({ privyId: identity.privyId, ...(identity.telegramId ? { telegramId: identity.telegramId, telegramUsername: identity.telegramUsername ?? null } : {}) })
      .where(eq(users.id, userId));

    for (const address of identity.externalAddresses) {
      await tx.insert(wallets).values({ userId, type: "external", address }).onConflictDoNothing();
    }
    if (identity.embedded) {
      const { walletId, address, delegated } = identity.embedded;
      const values = { userId, type: "embedded" as const, address, privyWalletId: walletId, delegated };
      await tx.insert(wallets).values(values).onConflictDoUpdate({ target: wallets.address, set: { userId, type: "embedded", privyWalletId: walletId, delegated } });
    }
    return userId;
  });
}
