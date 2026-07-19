-- Phase 5C.8 — Agent invites + audit payment target
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'PAYMENT';

CREATE TYPE "AgentRegistrationMode" AS ENUM ('INVITE_ONLY', 'PUBLIC_APPROVAL', 'DISABLED');

CREATE TABLE IF NOT EXISTS "agent_invites" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "token_hash" VARCHAR(255) NOT NULL,
  "email" VARCHAR(255),
  "created_by_id" UUID NOT NULL,
  "used_at" TIMESTAMPTZ(6),
  "used_by_user_id" UUID,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMPTZ(6),
  CONSTRAINT "agent_invites_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_invites_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "agent_invites_used_by_user_id_fkey" FOREIGN KEY ("used_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_invites_token_hash_key" ON "agent_invites"("token_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_invites_used_by_user_id_key" ON "agent_invites"("used_by_user_id") WHERE "used_by_user_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "agent_invites_deleted_at_idx" ON "agent_invites"("deleted_at");
