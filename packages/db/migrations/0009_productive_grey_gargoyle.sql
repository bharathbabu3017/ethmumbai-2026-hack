DROP INDEX "one_bot_wallet_per_user";--> statement-breakpoint
DELETE FROM "wallets" WHERE "type" = 'bot';--> statement-breakpoint
ALTER TABLE "wallets" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."wallet_type";--> statement-breakpoint
CREATE TYPE "public"."wallet_type" AS ENUM('external', 'embedded');--> statement-breakpoint
ALTER TABLE "wallets" ALTER COLUMN "type" SET DATA TYPE "public"."wallet_type" USING "type"::"public"."wallet_type";--> statement-breakpoint
CREATE INDEX "wallets_user" ON "wallets" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "wallets" DROP COLUMN "encrypted_key";