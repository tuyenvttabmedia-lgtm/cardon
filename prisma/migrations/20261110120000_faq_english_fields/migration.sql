-- Optional English copy for FAQ categories and items (fallback to Vietnamese when null/empty).
ALTER TABLE "faq_categories" ADD COLUMN IF NOT EXISTS "name_en" VARCHAR(128);
ALTER TABLE "faqs" ADD COLUMN IF NOT EXISTS "question_en" VARCHAR(500);
ALTER TABLE "faqs" ADD COLUMN IF NOT EXISTS "answer_en" TEXT;
