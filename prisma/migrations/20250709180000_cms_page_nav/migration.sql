-- Static page sidebar navigation (Trang thông tin)
ALTER TABLE "cms_pages"
  ADD COLUMN "show_in_nav" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "nav_sort_order" INTEGER NOT NULL DEFAULT 0;

-- Seed existing hardcoded sidebar items
UPDATE "cms_pages" SET "show_in_nav" = true, "nav_sort_order" = 1 WHERE "slug" = 'chinh-sach-bao-mat';
UPDATE "cms_pages" SET "show_in_nav" = true, "nav_sort_order" = 2 WHERE "slug" = 'dieu-khoan-su-dung';
UPDATE "cms_pages" SET "show_in_nav" = true, "nav_sort_order" = 3 WHERE "slug" = 'chinh-sach-hoan-tien';
UPDATE "cms_pages" SET "show_in_nav" = true, "nav_sort_order" = 4 WHERE "slug" = 'chinh-sach-thanh-toan';
UPDATE "cms_pages" SET "show_in_nav" = true, "nav_sort_order" = 5 WHERE "slug" = 'huong-dan';
UPDATE "cms_pages" SET "show_in_nav" = true, "nav_sort_order" = 6 WHERE "slug" = 'lien-he';
