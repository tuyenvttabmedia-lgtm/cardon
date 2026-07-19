-- Phase 6H.2 — Media library metadata (folder, dimensions, thumbnail)
ALTER TABLE "cms_media" ADD COLUMN IF NOT EXISTS "folder" VARCHAR(32) NOT NULL DEFAULT 'general';
ALTER TABLE "cms_media" ADD COLUMN IF NOT EXISTS "width" INTEGER;
ALTER TABLE "cms_media" ADD COLUMN IF NOT EXISTS "height" INTEGER;
ALTER TABLE "cms_media" ADD COLUMN IF NOT EXISTS "thumbnail_url" VARCHAR(512);

CREATE INDEX IF NOT EXISTS "cms_media_folder_idx" ON "cms_media"("folder");
