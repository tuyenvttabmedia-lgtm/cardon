-- Build 6032.2 — Notification Center (system_notifications)

ALTER TYPE "SystemActivityEventType" ADD VALUE IF NOT EXISTS 'LOW_PROVIDER_BALANCE';
ALTER TYPE "SystemActivityEventType" ADD VALUE IF NOT EXISTS 'LOW_AGENT_BALANCE';

CREATE TYPE "SystemNotificationType" AS ENUM (
  'SYSTEM',
  'SECURITY',
  'PAYMENT',
  'PROVIDER',
  'QUEUE',
  'WEBHOOK',
  'EMAIL',
  'MARKETING',
  'FINANCE',
  'ORDER'
);

CREATE TYPE "SystemNotificationSeverity" AS ENUM (
  'INFO',
  'SUCCESS',
  'WARNING',
  'ERROR',
  'CRITICAL'
);

CREATE TYPE "SystemNotificationChannel" AS ENUM (
  'IN_APP',
  'TELEGRAM',
  'EMAIL',
  'SLACK',
  'DISCORD'
);

CREATE TYPE "SystemNotificationRecipientType" AS ENUM (
  'USER',
  'ROLE'
);

CREATE TABLE "system_notifications" (
  "id" UUID NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "message" TEXT NOT NULL,
  "notification_type" "SystemNotificationType" NOT NULL,
  "severity" "SystemNotificationSeverity" NOT NULL,
  "source" "SystemActivitySource" NOT NULL,
  "resource" VARCHAR(128),
  "resource_id" VARCHAR(128),
  "resource_display" VARCHAR(255),
  "recipient_type" "SystemNotificationRecipientType" NOT NULL,
  "recipient_id" UUID,
  "recipient_role" "UserRole",
  "is_read" BOOLEAN NOT NULL DEFAULT false,
  "read_at" TIMESTAMPTZ(6),
  "channel" "SystemNotificationChannel" NOT NULL DEFAULT 'IN_APP',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "system_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "system_notifications_recipient_id_idx" ON "system_notifications"("recipient_id");
CREATE INDEX "system_notifications_recipient_role_idx" ON "system_notifications"("recipient_role");
CREATE INDEX "system_notifications_is_read_idx" ON "system_notifications"("is_read");
CREATE INDEX "system_notifications_severity_idx" ON "system_notifications"("severity");
CREATE INDEX "system_notifications_notification_type_idx" ON "system_notifications"("notification_type");
CREATE INDEX "system_notifications_created_at_idx" ON "system_notifications"("created_at");
