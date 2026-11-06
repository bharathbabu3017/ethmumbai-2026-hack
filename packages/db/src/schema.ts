import { sql } from "drizzle-orm";
import { bigint, index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const walletType = pgEnum("wallet_type", ["bot", "external"]);
export const orderSource = pgEnum("order_source", ["manual", "copy"]);
export const actionStatus = pgEnum("action_status", ["pending", "used"]);

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
    request: jsonb("request").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("orders_user").on(t.userId)],
);
