-- CreateEnum
CREATE TYPE "ContentPlanStatus" AS ENUM ('DRAFT', 'PLANNED', 'OUTLINE_READY', 'OUTLINE_APPROVED', 'CONTENT_READY', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContentPlanAction" AS ENUM ('CREATE', 'UPDATE', 'MERGE', 'IGNORE');

-- CreateEnum
CREATE TYPE "ContentPlanSearchIntent" AS ENUM ('INFORMATIONAL', 'NAVIGATIONAL', 'COMMERCIAL', 'TRANSACTIONAL', 'TROUBLESHOOTING');

-- CreateEnum
CREATE TYPE "ContentPlanContentType" AS ENUM ('GUIDE', 'TUTORIAL', 'TROUBLESHOOTING', 'COMPARISON', 'EXPLAINER', 'PROMOTION', 'PRODUCT', 'NEWS', 'FAQ');

-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AiTaskType" AS ENUM ('ANALYZE', 'OUTLINE', 'WRITE', 'QUALITY_CHECK', 'REGENERATE_SECTION');

-- CreateTable
CREATE TABLE "content_plans" (
    "id" UUID NOT NULL,
    "status" "ContentPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "action" "ContentPlanAction" NOT NULL DEFAULT 'CREATE',
    "generation_epoch" INTEGER NOT NULL DEFAULT 0,
    "source_type" VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
    "source_ref_id" UUID,
    "topic" VARCHAR(512) NOT NULL,
    "primary_keyword" VARCHAR(256) NOT NULL,
    "search_intent" "ContentPlanSearchIntent" NOT NULL,
    "content_type" "ContentPlanContentType" NOT NULL,
    "audience" VARCHAR(256),
    "business_objective" VARCHAR(256),
    "priority" VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
    "suggested_title" VARCHAR(255),
    "intelligence_snapshot" JSONB,
    "outline" JSONB,
    "article_document" JSONB,
    "quality_report" JSONB,
    "references" JSONB,
    "cms_page_id" UUID,
    "target_page_id" UUID,
    "created_by_id" UUID NOT NULL,
    "outline_approved_at" TIMESTAMPTZ(6),
    "content_approved_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "content_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_runs" (
    "id" UUID NOT NULL,
    "content_plan_id" UUID NOT NULL,
    "task" "AiTaskType" NOT NULL,
    "generation_epoch" INTEGER NOT NULL DEFAULT 0,
    "provider" VARCHAR(64) NOT NULL DEFAULT '',
    "model" VARCHAR(128) NOT NULL DEFAULT '',
    "prompt_version" VARCHAR(128) NOT NULL DEFAULT '',
    "status" "AiRunStatus" NOT NULL DEFAULT 'QUEUED',
    "input_hash" VARCHAR(128),
    "context_refs" JSONB,
    "input_snapshot" JSONB,
    "output_snapshot" JSONB,
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "cost_usd" DECIMAL(12,6),
    "duration_ms" INTEGER,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_prompt_templates" (
    "id" UUID NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "version" VARCHAR(32) NOT NULL,
    "content" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_plans_cms_page_id_key" ON "content_plans"("cms_page_id");

-- CreateIndex
CREATE INDEX "content_plans_status_idx" ON "content_plans"("status");

-- CreateIndex
CREATE INDEX "content_plans_created_by_id_idx" ON "content_plans"("created_by_id");

-- CreateIndex
CREATE INDEX "content_plans_primary_keyword_idx" ON "content_plans"("primary_keyword");

-- CreateIndex
CREATE INDEX "ai_runs_content_plan_id_created_at_idx" ON "ai_runs"("content_plan_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_runs_content_plan_id_task_generation_epoch_idx" ON "ai_runs"("content_plan_id", "task", "generation_epoch");

-- CreateIndex
CREATE INDEX "ai_runs_status_idx" ON "ai_runs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_prompt_templates_key_version_key" ON "ai_prompt_templates"("key", "version");

-- AddForeignKey
ALTER TABLE "content_plans" ADD CONSTRAINT "content_plans_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_content_plan_id_fkey" FOREIGN KEY ("content_plan_id") REFERENCES "content_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
