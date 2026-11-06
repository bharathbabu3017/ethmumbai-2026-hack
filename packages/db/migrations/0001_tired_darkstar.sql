CREATE TYPE "public"."call_status" AS ENUM('waiting', 'live', 'cancelled', 'target_hit', 'stopped_out', 'closed');--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trader_id" uuid NOT NULL,
	"order_id" text NOT NULL,
	"bracket_order_id" text,
	"funder_address" text NOT NULL,
	"chain" text NOT NULL,
	"token_symbol" text NOT NULL,
	"token_address" text NOT NULL,
	"entry_type" text NOT NULL,
	"entry_price" double precision,
	"stop_price" double precision NOT NULL,
	"target_price" double precision NOT NULL,
	"exit_price" double precision,
	"result_pct" double precision,
	"note" text,
	"status" "call_status" DEFAULT 'waiting' NOT NULL,
	"alerted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "calls_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "calls_bracket_order_id_unique" UNIQUE("bracket_order_id")
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" uuid NOT NULL,
	"trader_id" uuid NOT NULL,
	"alerts" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_trader_id_pk" PRIMARY KEY("follower_id","trader_id")
);
--> statement-breakpoint
CREATE TABLE "link_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "traders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"x_handle" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "traders_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "traders_display_name_unique" UNIQUE("display_name")
);
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "request" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "raw" jsonb;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_trader_id_traders_id_fk" FOREIGN KEY ("trader_id") REFERENCES "public"."traders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_trader_id_traders_id_fk" FOREIGN KEY ("trader_id") REFERENCES "public"."traders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_tokens" ADD CONSTRAINT "link_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traders" ADD CONSTRAINT "traders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calls_trader" ON "calls" USING btree ("trader_id");--> statement-breakpoint
CREATE INDEX "calls_created" ON "calls" USING btree ("created_at");