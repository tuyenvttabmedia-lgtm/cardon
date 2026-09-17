-- Real CMS article view counts (admin Views column).
ALTER TABLE "cms_pages" ADD COLUMN "view_count" INTEGER NOT NULL DEFAULT 0;
