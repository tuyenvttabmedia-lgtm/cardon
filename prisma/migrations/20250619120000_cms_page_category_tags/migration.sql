-- AlterTable
ALTER TABLE "cms_pages" ADD COLUMN "category" VARCHAR(128);
ALTER TABLE "cms_pages" ADD COLUMN "tags" JSONB NOT NULL DEFAULT '[]';
