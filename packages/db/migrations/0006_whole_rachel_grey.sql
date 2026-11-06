CREATE TYPE "public"."mirror_status" AS ENUM('pending', 'executing', 'placed', 'dismissed');--> statement-breakpoint
CREATE TABLE "mirrors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sell_order_id" text NOT NULL,
	"trader_user_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"token_address" text NOT NULL,
	"token_symbol" text NOT NULL,
	"percent" double precision NOT NULL,
	"qty" double precision NOT NULL,
	"status" "mirror_status" DEFAULT 'pending' NOT NULL,
	"order_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mirrors_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "held_before_sell" double precision;--> statement-breakpoint
ALTER TABLE "mirrors" ADD CONSTRAINT "mirrors_sell_order_id_orders_id_fk" FOREIGN KEY ("sell_order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirrors" ADD CONSTRAINT "mirrors_trader_user_id_users_id_fk" FOREIGN KEY ("trader_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirrors" ADD CONSTRAINT "mirrors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mirrors" ADD CONSTRAINT "mirrors_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_mirror_per_wallet" ON "mirrors" USING btree ("sell_order_id","wallet_id");--> statement-breakpoint
CREATE INDEX "mirrors_user" ON "mirrors" USING btree ("user_id");