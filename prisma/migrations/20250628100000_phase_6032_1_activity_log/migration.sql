-- Build 6032.1 — Activity Log Center (append-only system_activity_logs)

CREATE TYPE "SystemActivitySeverity" AS ENUM (
  'INFO',
  'SUCCESS',
  'WARNING',
  'ERROR',
  'CRITICAL'
);

CREATE TYPE "SystemActivityEventCategory" AS ENUM (
  'AUTH',
  'SYSTEM',
  'PAYMENT',
  'PROVIDER',
  'PRODUCT',
  'ORDER',
  'CUSTOMER',
  'PARTNER',
  'FINANCE',
  'MARKETING',
  'QUEUE',
  'WEBHOOK',
  'EMAIL',
  'SECURITY',
  'API',
  'EXPORT',
  'IMPORT'
);

CREATE TYPE "SystemActivitySource" AS ENUM (
  'ADMIN',
  'PARTNER',
  'CUSTOMER',
  'API',
  'WORKER',
  'CRON',
  'SYSTEM'
);

CREATE TYPE "SystemActivityEventType" AS ENUM (
  'LOGIN',
  'LOGOUT',
  'LOGIN_FAILED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'SMTP_TEST',
  'SMTP_SUCCESS',
  'SMTP_FAILED',
  'PROVIDER_SYNC',
  'PROVIDER_SYNC_FAILED',
  'QUEUE_RETRY',
  'QUEUE_FAILED',
  'QUEUE_COMPLETED',
  'WEBHOOK_RECEIVED',
  'WEBHOOK_SUCCESS',
  'WEBHOOK_FAILED',
  'EXPORT_CSV',
  'EXPORT_EXCEL',
  'DOWNLOAD_PIN',
  'DOWNLOAD_ZIP',
  'API_KEY_CREATED',
  'API_KEY_ROTATED',
  'API_KEY_DISABLED',
  'CRON_STARTED',
  'CRON_FINISHED',
  'MAINTENANCE_ENABLED',
  'MAINTENANCE_DISABLED'
);

CREATE TABLE "system_activity_logs" (
  "id" UUID NOT NULL,
  "event_type" "SystemActivityEventType" NOT NULL,
  "event_category" "SystemActivityEventCategory" NOT NULL,
  "severity" "SystemActivitySeverity" NOT NULL,
  "source" "SystemActivitySource" NOT NULL,
  "resource" VARCHAR(128),
  "resource_id" VARCHAR(128),
  "resource_display" VARCHAR(255),
  "title" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "performed_by" UUID,
  "performed_email" VARCHAR(255),
  "performed_role" "UserRole",
  "ip_address" VARCHAR(64),
  "user_agent" VARCHAR(512),
  "session_id" VARCHAR(128),
  "correlation_id" VARCHAR(64),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "system_activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "system_activity_logs_created_at_idx" ON "system_activity_logs"("created_at");
CREATE INDEX "system_activity_logs_event_type_idx" ON "system_activity_logs"("event_type");
CREATE INDEX "system_activity_logs_event_category_idx" ON "system_activity_logs"("event_category");
CREATE INDEX "system_activity_logs_severity_idx" ON "system_activity_logs"("severity");
CREATE INDEX "system_activity_logs_source_idx" ON "system_activity_logs"("source");
CREATE INDEX "system_activity_logs_performed_by_idx" ON "system_activity_logs"("performed_by");
CREATE INDEX "system_activity_logs_resource_idx" ON "system_activity_logs"("resource");
