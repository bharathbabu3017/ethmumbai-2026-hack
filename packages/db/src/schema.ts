import { sql } from "drizzle-orm";
import { bigint, boolean, doublePrecision, index, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const walletType = pgEnum("wallet_type", ["bot", "external"]);
export const orderSource = pgEnum("order_source", ["manual", "copy"]);
export const actionStatus = pgEnum("action_status", ["pending", "used"]);
export const copyStatus = pgEnum("copy_status", ["pending", "placed"]);
export const callStatus = pgEnum("call_status", ["waiting", "live", "cancelled", "target_hit", "stopped_out", "closed"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  telegramId: bigint("telegram_id", { mode: "number" }).unique(),
  telegramUsername: text("telegram_username"),
  privyId: text("privy_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    type: walletType("type").notNull(),
    address: text("address").notNull().unique(),
    encryptedKey: text("encrypted_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("one_bot_wallet_per_user").on(t.userId).where(sql`${t.type} = 'bot'`)],
);

// A confirm button points at one of these, so it can only ever run once.
export const pendingActions = pgTable("pending_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  status: actionStatus("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable(
  "orders",
  {
    id: text("id").primaryKey(), // Flash orderId
    userId: uuid("user_id").notNull().references(() => users.id),
    walletId: uuid("wallet_id").notNull().references(() => wallets.id),
    source: orderSource("source").notNull().default("manual"),
    request: jsonb("request"),
    status: text("status"),
    raw: jsonb("raw"), // latest frame from the Flash orders stream
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("orders_user").on(t.userId)],
);

export const traders = pgTable("traders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id),
  displayName: text("display_name").notNull().unique(),
  bio: text("bio"),
  xHandle: text("x_handle"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const calls = pgTable(
  "calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    traderId: uuid("trader_id").notNull().references(() => traders.id),
    orderId: text("order_id").notNull().unique(), // the entry order
    bracketOrderId: text("bracket_order_id").unique(),
    funderAddress: text("funder_address").notNull(),
    chain: text("chain").notNull(),
    tokenSymbol: text("token_symbol").notNull(),
    tokenAddress: text("token_address").notNull(),
    entryType: text("entry_type").notNull(),
    entryPrice: doublePrecision("entry_price"), // null until a market entry fills
    stopPrice: doublePrecision("stop_price").notNull(),
    targetPrice: doublePrecision("target_price").notNull(),
    exitPrice: doublePrecision("exit_price"),
    resultPct: doublePrecision("result_pct"),
    note: text("note"),
    status: callStatus("status").notNull().default("waiting"),
    alertedAt: timestamp("alerted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [index("calls_trader").on(t.traderId), index("calls_created").on(t.createdAt)],
);

export const follows = pgTable(
  "follows",
  {
    followerId: uuid("follower_id").notNull().references(() => users.id),
    traderId: uuid("trader_id").notNull().references(() => traders.id),
    alerts: boolean("alerts").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.traderId] })],
);

export const linkTokens = pgTable("link_tokens", {
  token: text("token").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

// A pending row reserves the copy before it is signed, so a call can't be copied twice by one wallet.
export const copies = pgTable(
  "copies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    callId: uuid("call_id").notNull().references(() => calls.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    walletId: uuid("wallet_id").notNull().references(() => wallets.id),
    orderId: text("order_id").unique(),
    amountUsd: doublePrecision("amount_usd").notNull(),
    stopPrice: doublePrecision("stop_price").notNull(),
    targetPrice: doublePrecision("target_price").notNull(),
    status: copyStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("one_copy_per_wallet").on(t.callId, t.walletId)],
);
