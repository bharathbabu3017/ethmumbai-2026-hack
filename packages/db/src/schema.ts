import { sql } from "drizzle-orm";
import { bigint, boolean, doublePrecision, index, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const walletType = pgEnum("wallet_type", ["bot", "external"]);
export const orderSource = pgEnum("order_source", ["manual", "copy"]);
export const actionStatus = pgEnum("action_status", ["pending", "used"]);
export const jobStatus = pgEnum("job_status", ["queued", "running", "done", "failed"]);
export const copyStatus = pgEnum("copy_status", ["pending", "placed"]);

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
    isPublic: boolean("is_public").notNull().default(false), // placed by a trader, so it shows on their profile
    side: text("side"),
    orderType: text("order_type"),
    chain: text("chain"),
    tokenSymbol: text("token_symbol"),
    tokenAddress: text("token_address"),
    qty: text("qty"), // spent amount: USDC on a buy, the token on a sell
    limitPrice: doublePrecision("limit_price"),
    stopPrice: doublePrecision("stop_price"),
    targetPrice: doublePrecision("target_price"),
    entryOrderId: text("entry_order_id"), // on a bracket's exit: the order it protects
    filledQty: doublePrecision("filled_qty").notNull().default(0),
    filledUsd: doublePrecision("filled_usd").notNull().default(0),
    realizedUsd: doublePrecision("realized_usd").notNull().default(0), // profit on what this order sold
    soldCostUsd: doublePrecision("sold_cost_usd").notNull().default(0), // what that sold amount cost
    placedAt: timestamp("placed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("orders_user").on(t.userId), index("orders_public_placed").on(t.isPublic, t.placedAt)],
);

export const positions = pgTable(
  "positions",
  {
    walletId: uuid("wallet_id").notNull().references(() => wallets.id),
    tokenAddress: text("token_address").notNull(),
    tokenSymbol: text("token_symbol").notNull(),
    qty: doublePrecision("qty").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.walletId, t.tokenAddress] })],
);

export const traders = pgTable("traders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => users.id),
  displayName: text("display_name").notNull().unique(),
  bio: text("bio"),
  xHandle: text("x_handle"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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

// A pending row reserves the copy before it is signed, so a trade can't be copied twice by one wallet.
export const copies = pgTable(
  "copies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceOrderId: text("source_order_id").notNull().references(() => orders.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    walletId: uuid("wallet_id").notNull().references(() => wallets.id),
    orderId: text("order_id").unique(),
    amountUsd: doublePrecision("amount_usd").notNull(),
    stopPrice: doublePrecision("stop_price"),
    targetPrice: doublePrecision("target_price"),
    status: copyStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("one_copy_per_wallet").on(t.sourceOrderId, t.walletId)],
);

// Actions on a Telegram wallet requested from the Mini App. Only the worker holds the keys, so it runs these.
export const walletJobs = pgTable(
  "wallet_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    walletId: uuid("wallet_id").notNull().references(() => wallets.id),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    status: jobStatus("status").notNull().default("queued"),
    result: jsonb("result"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("wallet_jobs_status").on(t.status, t.createdAt)],
);
