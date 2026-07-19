-- Build 6032.4 Webhook Monitor — extend webhook_logs for monitoring ops only

ALTER TYPE "WebhookSource" ADD VALUE 'PROVIDER';
ALTER TYPE "WebhookSource" ADD VALUE 'PARTNER';
ALTER TYPE "WebhookSource" ADD VALUE 'INTERNAL';

ALTER TABLE "webhook_logs" ADD COLUMN IF NOT EXISTS "retry_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "webhook_logs" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMPTZ(6);
ALTER TABLE "webhook_logs" ADD COLUMN IF NOT EXISTS "monitor_metadata" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS "webhook_logs_source_idx" ON "webhook_logs"("source");
CREATE INDEX IF NOT EXISTS "webhook_logs_created_at_idx" ON "webhook_logs"("created_at");
