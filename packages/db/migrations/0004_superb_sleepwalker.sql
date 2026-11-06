CREATE TABLE "copies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_order_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"order_id" text,
	"amount_usd" double precision NOT NULL,
	"stop_price" double precision,
	"target_price" double precision,
	"status" "copy_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "copies_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"wallet_id" uuid NOT NULL,
	"token_address" text NOT NULL,
	"token_symbol" text NOT NULL,
	"qty" double precision DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	CONSTRAINT "positions_wallet_id_token_address_pk" PRIMARY KEY("wallet_id","token_address")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "side" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_type" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "chain" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "token_symbol" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "token_address" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "qty" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "limit_price" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stop_price" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "target_price" double precision;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "entry_order_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "filled_qty" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "filled_usd" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "realized_usd" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "sold_cost_usd" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "placed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "copies" ADD CONSTRAINT "copies_source_order_id_orders_id_fk" FOREIGN KEY ("source_order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copies" ADD CONSTRAINT "copies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copies" ADD CONSTRAINT "copies_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_copy_per_wallet" ON "copies" USING btree ("source_order_id","wallet_id");--> statement-breakpoint
CREATE INDEX "orders_public_placed" ON "orders" USING btree ("is_public","placed_at");