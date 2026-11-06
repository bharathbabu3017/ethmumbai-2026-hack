CREATE TABLE "sent_alerts" (
	"chat_id" bigint NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sent_alerts_chat_id_key_pk" PRIMARY KEY("chat_id","key")
);
