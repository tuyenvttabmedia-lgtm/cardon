-- Persist scheduled publish on CMS pages (server-side cron publishes due drafts).
ALTER TABLE "cms_pages"
ADD COLUMN IF NOT EXISTS "scheduled_publish_at" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "cms_pages_status_scheduled_publish_at_idx"
ON "cms_pages" ("status", "scheduled_publish_at");
