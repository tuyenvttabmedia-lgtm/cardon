-- Build 6033.5 API Security Center
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "security_config" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "agent_webhook_configs" ADD COLUMN IF NOT EXISTS "secret_encrypted" TEXT;
ALTER TABLE "agent_webhook_configs" ADD COLUMN IF NOT EXISTS "signature_algorithm" VARCHAR(32) NOT NULL DEFAULT 'HMAC-SHA256';
