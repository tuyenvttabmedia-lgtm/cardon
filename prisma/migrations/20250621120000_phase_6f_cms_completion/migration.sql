-- Phase 6F — CMS categories, tags, media, SEO focus keyword

CREATE TABLE "cms_categories" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(128) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" VARCHAR(512),
    "meta_title" VARCHAR(128),
    "meta_description" VARCHAR(256),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cms_categories_slug_key" ON "cms_categories"("slug");

CREATE TABLE "cms_tags" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(128) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "meta_title" VARCHAR(128),
    "meta_description" VARCHAR(256),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cms_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cms_tags_slug_key" ON "cms_tags"("slug");

CREATE TABLE "cms_page_tags" (
    "page_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "cms_page_tags_pkey" PRIMARY KEY ("page_id","tag_id")
);

CREATE TABLE "cms_media" (
    "id" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(128) NOT NULL,
    "size" INTEGER NOT NULL,
    "url" VARCHAR(512) NOT NULL,
    "alt" VARCHAR(255),
    "title" VARCHAR(255),
    "storage_key" VARCHAR(512) NOT NULL,
    "storage" VARCHAR(32) NOT NULL DEFAULT 'local',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "cms_media_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cms_media_deleted_at_idx" ON "cms_media"("deleted_at");

ALTER TABLE "cms_pages" ADD COLUMN "category_id" UUID;

CREATE INDEX "cms_pages_category_id_idx" ON "cms_pages"("category_id");

ALTER TABLE "cms_seo" ADD COLUMN "focus_keyword" VARCHAR(128);

ALTER TABLE "cms_pages" ADD CONSTRAINT "cms_pages_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "cms_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cms_page_tags" ADD CONSTRAINT "cms_page_tags_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "cms_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cms_page_tags" ADD CONSTRAINT "cms_page_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "cms_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
