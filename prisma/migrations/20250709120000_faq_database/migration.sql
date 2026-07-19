-- FAQ database migration — categories, faqs, positions

CREATE TYPE "FaqStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');
CREATE TYPE "FaqCategoryStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "faq_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "slug" VARCHAR(128) NOT NULL,
    "description" VARCHAR(512),
    "icon" VARCHAR(32),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "FaqCategoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "faq_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "faq_categories_slug_key" ON "faq_categories"("slug");
CREATE INDEX "faq_categories_status_sort_order_idx" ON "faq_categories"("status", "sort_order");

CREATE TABLE "faqs" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "question" VARCHAR(500) NOT NULL,
    "answer" TEXT NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "FaqStatus" NOT NULL DEFAULT 'DRAFT',
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "faqs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "faqs_slug_key" ON "faqs"("slug");
CREATE INDEX "faqs_category_id_idx" ON "faqs"("category_id");
CREATE INDEX "faqs_status_sort_order_idx" ON "faqs"("status", "sort_order");
CREATE INDEX "faqs_featured_status_sort_order_idx" ON "faqs"("featured", "status", "sort_order");

ALTER TABLE "faqs" ADD CONSTRAINT "faqs_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "faq_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "faq_positions" (
    "faq_id" UUID NOT NULL,
    "position" VARCHAR(64) NOT NULL,

    CONSTRAINT "faq_positions_pkey" PRIMARY KEY ("faq_id", "position")
);

CREATE INDEX "faq_positions_position_idx" ON "faq_positions"("position");

ALTER TABLE "faq_positions" ADD CONSTRAINT "faq_positions_faq_id_fkey"
    FOREIGN KEY ("faq_id") REFERENCES "faqs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default categories
INSERT INTO "faq_categories" ("id", "name", "slug", "description", "icon", "sort_order", "status", "updated_at") VALUES
    ('a1000001-0000-4000-8000-000000000001', 'Chung', 'chung', 'Câu hỏi chung', 'help-circle', 0, 'ACTIVE', CURRENT_TIMESTAMP),
    ('a1000001-0000-4000-8000-000000000002', 'Thanh toán', 'thanh-toan', 'Thanh toán và VietQR', 'credit-card', 1, 'ACTIVE', CURRENT_TIMESTAMP),
    ('a1000001-0000-4000-8000-000000000003', 'Mua thẻ', 'mua-the', 'Thẻ game và thẻ điện thoại', 'shopping-bag', 2, 'ACTIVE', CURRENT_TIMESTAMP),
    ('a1000001-0000-4000-8000-000000000004', 'Nạp cước', 'nap-cuoc', 'Nạp tiền điện thoại', 'phone', 3, 'ACTIVE', CURRENT_TIMESTAMP),
    ('a1000001-0000-4000-8000-000000000005', 'Data 4G/5G', 'data-4g-5g', 'Gói data di động', 'wifi', 4, 'ACTIVE', CURRENT_TIMESTAMP),
    ('a1000001-0000-4000-8000-000000000006', 'Hoàn tiền', 'hoan-tien', 'Chính sách hoàn tiền', 'rotate-ccw', 5, 'ACTIVE', CURRENT_TIMESTAMP),
    ('a1000001-0000-4000-8000-000000000007', 'Tài khoản', 'tai-khoan', 'Tài khoản khách hàng', 'user', 6, 'ACTIVE', CURRENT_TIMESTAMP);
