-- CMS locale copies. Original columns on cms_pages, cms_seo, cms_categories and cms_tags are not modified.

DO $$ BEGIN
  CREATE TYPE "CmsContentLocale" AS ENUM ('vi', 'en');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "cms_page_translations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "page_id" UUID NOT NULL,
  "locale" "CmsContentLocale" NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "excerpt" VARCHAR(512),
  "content" TEXT NOT NULL,
  "status" "CmsPageStatus" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cms_page_translations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cms_seo_translations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "page_id" UUID NOT NULL,
  "locale" "CmsContentLocale" NOT NULL,
  "meta_title" VARCHAR(128) NOT NULL,
  "meta_description" VARCHAR(256) NOT NULL,
  "meta_keywords" VARCHAR(256),
  "focus_keyword" VARCHAR(128),
  "og_title" VARCHAR(128),
  "og_description" VARCHAR(256),
  "canonical_url" VARCHAR(512),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cms_seo_translations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cms_category_translations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "category_id" UUID NOT NULL,
  "locale" "CmsContentLocale" NOT NULL,
  "name" VARCHAR(128) NOT NULL,
  "description" VARCHAR(512),
  "intro" TEXT,
  "meta_title" VARCHAR(128),
  "meta_description" VARCHAR(256),
  "canonical_url" VARCHAR(512),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cms_category_translations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cms_tag_translations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tag_id" UUID NOT NULL,
  "locale" "CmsContentLocale" NOT NULL,
  "name" VARCHAR(128) NOT NULL,
  "meta_title" VARCHAR(128),
  "meta_description" VARCHAR(256),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cms_tag_translations_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "cms_page_translations"
    ADD CONSTRAINT "cms_page_translations_page_id_fkey"
    FOREIGN KEY ("page_id") REFERENCES "cms_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cms_seo_translations"
    ADD CONSTRAINT "cms_seo_translations_page_id_fkey"
    FOREIGN KEY ("page_id") REFERENCES "cms_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cms_category_translations"
    ADD CONSTRAINT "cms_category_translations_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "cms_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "cms_tag_translations"
    ADD CONSTRAINT "cms_tag_translations_tag_id_fkey"
    FOREIGN KEY ("tag_id") REFERENCES "cms_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "cms_page_translations_page_id_locale_key"
  ON "cms_page_translations"("page_id", "locale");
CREATE INDEX IF NOT EXISTS "cms_page_translations_page_id_locale_status_idx"
  ON "cms_page_translations"("page_id", "locale", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "cms_seo_translations_page_id_locale_key"
  ON "cms_seo_translations"("page_id", "locale");
CREATE INDEX IF NOT EXISTS "cms_seo_translations_page_id_locale_idx"
  ON "cms_seo_translations"("page_id", "locale");

CREATE UNIQUE INDEX IF NOT EXISTS "cms_category_translations_category_id_locale_key"
  ON "cms_category_translations"("category_id", "locale");
CREATE INDEX IF NOT EXISTS "cms_category_translations_category_id_locale_idx"
  ON "cms_category_translations"("category_id", "locale");

CREATE UNIQUE INDEX IF NOT EXISTS "cms_tag_translations_tag_id_locale_key"
  ON "cms_tag_translations"("tag_id", "locale");
CREATE INDEX IF NOT EXISTS "cms_tag_translations_tag_id_locale_idx"
  ON "cms_tag_translations"("tag_id", "locale");

-- Vietnamese copies only. English rows are never invented. Re-runs do not overwrite.
INSERT INTO "cms_page_translations" (
  "id", "page_id", "locale", "title", "excerpt", "content", "status", "created_at", "updated_at"
)
SELECT gen_random_uuid(), "id", 'vi', "title", "excerpt", "content", "status", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "cms_pages"
ON CONFLICT ("page_id", "locale") DO NOTHING;

INSERT INTO "cms_seo_translations" (
  "id", "page_id", "locale", "meta_title", "meta_description", "meta_keywords", "focus_keyword",
  "og_title", "og_description", "canonical_url", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), "page_id", 'vi', "meta_title", "meta_description", "meta_keywords", "focus_keyword",
  "og_title", "og_description", "canonical_url", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "cms_seo"
ON CONFLICT ("page_id", "locale") DO NOTHING;

INSERT INTO "cms_category_translations" (
  "id", "category_id", "locale", "name", "description", "intro", "meta_title", "meta_description",
  "canonical_url", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), "id", 'vi', "name", "description", "intro", "meta_title", "meta_description",
  "canonical_url", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "cms_categories"
ON CONFLICT ("category_id", "locale") DO NOTHING;

INSERT INTO "cms_tag_translations" (
  "id", "tag_id", "locale", "name", "meta_title", "meta_description", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), "id", 'vi', "name", "meta_title", "meta_description", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "cms_tags"
ON CONFLICT ("tag_id", "locale") DO NOTHING;
