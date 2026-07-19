-- Build 6032.0 — Settings Audit Log (append-only system_audit_logs)

CREATE TYPE "SystemAuditResource" AS ENUM (
  'SMTP',
  'SEO',
  'SYSTEM',
  'FEATURE_FLAG',
  'PROVIDER',
  'PAYMENT_GATEWAY',
  'SETTING',
  'ROLE',
  'PERMISSION',
  'CMS',
  'EMAIL_TEMPLATE',
  'BANNER',
  'API_KEY',
  'AGENT',
  'FINANCE',
  'PROMOTION',
  'CUSTOMER'
);

CREATE TYPE "SystemAuditAction" AS ENUM (
  'CREATE',
  'UPDATE',
  'DELETE',
  'ENABLE',
  'DISABLE',
  'LOGIN',
  'LOGOUT',
  'IMPORT',
  'EXPORT',
  'SYNC',
  'TEST',
  'ROTATE_KEY',
  'RESET',
  'APPROVE',
  'REJECT'
);

CREATE TABLE "system_audit_logs" (
  "id" UUID NOT NULL,
  "resource" "SystemAuditResource" NOT NULL,
  "resource_id" VARCHAR(128),
  "resource_name" VARCHAR(255),
  "action" "SystemAuditAction" NOT NULL,
  "field_name" VARCHAR(255),
  "old_value" JSONB,
  "new_value" JSONB,
  "performed_by" UUID NOT NULL,
  "performed_email" VARCHAR(255) NOT NULL,
  "performed_role" "UserRole" NOT NULL,
  "ip_address" VARCHAR(64),
  "user_agent" VARCHAR(512),
  "session_id" VARCHAR(128),
  "correlation_id" VARCHAR(64),
  "reason" VARCHAR(512),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "system_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "system_audit_logs_created_at_idx" ON "system_audit_logs"("created_at");
CREATE INDEX "system_audit_logs_resource_idx" ON "system_audit_logs"("resource");
CREATE INDEX "system_audit_logs_action_idx" ON "system_audit_logs"("action");
CREATE INDEX "system_audit_logs_performed_by_idx" ON "system_audit_logs"("performed_by");
CREATE INDEX "system_audit_logs_resource_id_idx" ON "system_audit_logs"("resource_id");
