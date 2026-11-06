CREATE TABLE "copy_settings" (
	"user_id" uuid NOT NULL,
	"trader_id" uuid NOT NULL,
	"settings" jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "copy_settings_user_id_trader_id_pk" PRIMARY KEY("user_id","trader_id")
);
--> statement-breakpoint
ALTER TABLE "copies" ADD COLUMN "auto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "copy_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "copy_settings" ADD CONSTRAINT "copy_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copy_settings" ADD CONSTRAINT "copy_settings_trader_id_traders_id_fk" FOREIGN KEY ("trader_id") REFERENCES "public"."traders"("id") ON DELETE no action ON UPDATE no action;