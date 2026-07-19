-- CMS page layout templates (ARTICLE | LANDING | POLICY)
CREATE TYPE "CmsPageLayout" AS ENUM ('ARTICLE', 'LANDING', 'POLICY');

ALTER TABLE "cms_pages" ADD COLUMN "page_layout" "CmsPageLayout" NOT NULL DEFAULT 'ARTICLE';

UPDATE "cms_pages"
SET "page_layout" = 'LANDING'
WHERE "slug" = 'gioi-thieu';

UPDATE "cms_pages"
SET "page_layout" = 'POLICY'
WHERE "slug" IN (
  'chinh-sach-bao-mat',
  'dieu-khoan-su-dung',
  'chinh-sach-hoan-tien',
  'chinh-sach-thanh-toan'
);
