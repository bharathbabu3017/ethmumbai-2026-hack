CREATE TYPE "public"."agent_status" AS ENUM('funding', 'running', 'paused', 'stopped');--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"trader_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"settings" jsonb NOT NULL,
	"status" "agent_status" DEFAULT 'funding' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "agents_trader_id_unique" UNIQUE("trader_id"),
	CONSTRAINT "agents_wallet_id_unique" UNIQUE("wallet_id")
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_trader_id_traders_id_fk" FOREIGN KEY ("trader_id") REFERENCES "public"."traders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_owner" ON "agents" USING btree ("owner_id");