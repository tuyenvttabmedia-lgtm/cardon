-- Phase 6L: contact messages
CREATE TYPE "ContactMessageStatus" AS ENUM ('NEW', 'PROCESSED');

CREATE TABLE "contact_messages" (
    "id" UUID NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(32),
    "subject" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "status" "ContactMessageStatus" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contact_messages_status_idx" ON "contact_messages"("status");
CREATE INDEX "contact_messages_created_at_idx" ON "contact_messages"("created_at");
