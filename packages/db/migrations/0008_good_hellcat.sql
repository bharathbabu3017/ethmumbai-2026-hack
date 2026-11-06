ALTER TYPE "public"."wallet_type" ADD VALUE 'embedded';--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "privy_wallet_id" text;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "delegated" boolean DEFAULT false NOT NULL;