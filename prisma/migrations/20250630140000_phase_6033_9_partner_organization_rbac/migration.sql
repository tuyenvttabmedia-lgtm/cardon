-- BUILD 6033.9 Partner Organization & RBAC

CREATE TYPE "AgentMemberRole" AS ENUM ('OWNER', 'MANAGER', 'FINANCE', 'OPERATOR', 'DEVELOPER', 'READONLY');
CREATE TYPE "AgentMemberStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED', 'INVITED', 'PENDING');
CREATE TYPE "AgentMemberInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED');

CREATE TABLE "agent_members" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "AgentMemberRole" NOT NULL DEFAULT 'OPERATOR',
    "status" "AgentMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "display_name" VARCHAR(128),
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "invited_by_id" UUID,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agent_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_member_invites" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "role" "AgentMemberRole" NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "status" "AgentMemberInviteStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agent_member_invites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_login_histories" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "agent_id" UUID,
    "ip_address" VARCHAR(64),
    "country" VARCHAR(64),
    "user_agent" VARCHAR(512),
    "browser" VARCHAR(128),
    "device" VARCHAR(128),
    "result" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_login_histories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_impersonation_sessions" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "read_only" BOOLEAN NOT NULL DEFAULT true,
    "ip_address" VARCHAR(64),
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "agent_impersonation_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_members_user_id_key" ON "agent_members"("user_id");
CREATE UNIQUE INDEX "agent_members_agent_id_user_id_key" ON "agent_members"("agent_id", "user_id");
CREATE INDEX "agent_members_agent_id_idx" ON "agent_members"("agent_id");
CREATE INDEX "agent_members_status_idx" ON "agent_members"("status");

CREATE INDEX "agent_member_invites_agent_id_idx" ON "agent_member_invites"("agent_id");
CREATE INDEX "agent_member_invites_email_idx" ON "agent_member_invites"("email");
CREATE INDEX "agent_member_invites_token_hash_idx" ON "agent_member_invites"("token_hash");
CREATE INDEX "agent_member_invites_status_idx" ON "agent_member_invites"("status");

CREATE INDEX "agent_login_histories_user_id_created_at_idx" ON "agent_login_histories"("user_id", "created_at");
CREATE INDEX "agent_login_histories_agent_id_idx" ON "agent_login_histories"("agent_id");

CREATE INDEX "agent_impersonation_sessions_admin_user_id_idx" ON "agent_impersonation_sessions"("admin_user_id");
CREATE INDEX "agent_impersonation_sessions_agent_id_idx" ON "agent_impersonation_sessions"("agent_id");
CREATE INDEX "agent_impersonation_sessions_target_user_id_idx" ON "agent_impersonation_sessions"("target_user_id");

ALTER TABLE "agent_members" ADD CONSTRAINT "agent_members_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_members" ADD CONSTRAINT "agent_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_members" ADD CONSTRAINT "agent_members_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_member_invites" ADD CONSTRAINT "agent_member_invites_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_member_invites" ADD CONSTRAINT "agent_member_invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "agent_login_histories" ADD CONSTRAINT "agent_login_histories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_impersonation_sessions" ADD CONSTRAINT "agent_impersonation_sessions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_impersonation_sessions" ADD CONSTRAINT "agent_impersonation_sessions_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_impersonation_sessions" ADD CONSTRAINT "agent_impersonation_sessions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill primary owners as AgentMember OWNER
INSERT INTO "agent_members" ("id", "agent_id", "user_id", "role", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), a."id", a."user_id", 'OWNER'::"AgentMemberRole", 'ACTIVE'::"AgentMemberStatus", NOW(), NOW()
FROM "agents" a
WHERE a."deleted_at" IS NULL
ON CONFLICT ("user_id") DO NOTHING;
