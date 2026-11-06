import { and, eq, gt, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { orders, pendingActions, users, wallets } from "./schema";

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
