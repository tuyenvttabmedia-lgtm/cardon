/**
 * Local dev helper — verify agent emails + seed KYC test accounts (localhost only).
 *
 * Usage (inside api container):
 *   node --experimental-strip-types /app/scripts/local-dev-kyc-helper.ts
 *   node --experimental-strip-types /app/scripts/local-dev-kyc-helper.ts yang@example.com
 *
 * From host:
 *   docker cp scripts/local-dev-kyc-helper.ts cardon-local-full-api:/app/scripts/
 *   docker exec cardon-local-full-api node --experimental-strip-types /app/scripts/local-dev-kyc-helper.ts
 */
import {
  AgentAccountType,
  AgentKycStatus,
  AgentStatus,
  PrismaClient,
  UserRole,
  UserStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const PASSWORD = process.env.LOCAL_FULL_PASSWORD ?? 'LocalTest2026!';
const UPLOAD_ROOT = process.env.MEDIA_UPLOAD_ROOT
  ? join(process.cwd(), process.env.MEDIA_UPLOAD_ROOT)
  : join(process.cwd(), 'uploads');

const MINI_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const KYC_TEST_ACCOUNTS = {
  draft: {
    email: 'kyc-draft@test.local',
    fullName: 'KYC Draft Test',
    companyName: 'KYC Draft Co',
    accountType: AgentAccountType.PERSONAL,
    kycStatus: null as AgentKycStatus | null,
    agentStatus: AgentStatus.PENDING_KYC,
  },
  submitted: {
    email: 'kyc-review@test.local',
    fullName: 'KYC Review Test',
    companyName: 'KYC Review Co',
    accountType: AgentAccountType.PERSONAL,
    kycStatus: AgentKycStatus.SUBMITTED,
    agentStatus: AgentStatus.PENDING_KYC,
  },
};

async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

function writePlaceholderDoc(agentId: string, filename: string): string {
  const dir = join(UPLOAD_ROOT, 'kyc', agentId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), MINI_PNG);
  return `kyc/${agentId}/${filename}`;
}

async function verifyAgentEmails(extraEmails: string[] = []) {
  const now = new Date();

  const unverified = await prisma.user.updateMany({
    where: {
      deletedAt: null,
      role: UserRole.AGENT,
      emailVerifiedAt: null,
    },
    data: { emailVerifiedAt: now },
  });

  let specific = 0;
  for (const email of extraEmails) {
    const normalized = email.trim().toLowerCase();
    if (!normalized) continue;
    const res = await prisma.user.updateMany({
      where: {
        deletedAt: null,
        role: UserRole.AGENT,
        email: { equals: normalized, mode: 'insensitive' },
        emailVerifiedAt: null,
      },
      data: { emailVerifiedAt: now },
    });
    specific += res.count;
  }

  console.log(`[local-dev-kyc] Verified ${unverified.count} unverified agent account(s)`);
  if (extraEmails.length) {
    console.log(`[local-dev-kyc] Verified ${specific} specified email(s)`);
  }
}

async function ensureKycTestAccount(
  spec: (typeof KYC_TEST_ACCOUNTS)['draft'],
  superAdminId: string,
) {
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: spec.email },
    update: {
      role: UserRole.AGENT,
      status: UserStatus.ACTIVE,
      passwordHash,
      fullName: spec.fullName,
      emailVerifiedAt: new Date(),
      phone: '0900000001',
    },
    create: {
      email: spec.email,
      passwordHash,
      role: UserRole.AGENT,
      status: UserStatus.ACTIVE,
      fullName: spec.fullName,
      emailVerifiedAt: new Date(),
      phone: '0900000001',
    },
  });

  const agent = await prisma.agent.upsert({
    where: { userId: user.id },
    update: {
      companyName: spec.companyName,
      contactEmail: spec.email,
      status: spec.agentStatus,
      apiEnabled: false,
      securityConfig: {
        onboarding: {
          accountType: spec.accountType,
          source: 'local-dev-kyc-helper',
          registeredAt: new Date().toISOString(),
        },
      },
    },
    create: {
      userId: user.id,
      companyName: spec.companyName,
      contactEmail: spec.email,
      status: spec.agentStatus,
      apiEnabled: false,
      securityConfig: {
        onboarding: {
          accountType: spec.accountType,
          source: 'local-dev-kyc-helper',
          registeredAt: new Date().toISOString(),
        },
      },
    },
  });

  if (!spec.kycStatus) {
    await prisma.agentKyc.deleteMany({ where: { agentId: agent.id } });
    console.log(`[local-dev-kyc] ${spec.email} — email verified, chưa nộp KYC (test form gửi hồ sơ)`);
    return;
  }

  const cccdFront = writePlaceholderDoc(agent.id, 'cccd-front.png');
  const cccdBack = writePlaceholderDoc(agent.id, 'cccd-back.png');
  const selfie = writePlaceholderDoc(agent.id, 'selfie.png');

  const profile = {
    fullName: spec.fullName,
    dob: '1990-01-15',
    cccd: '001234567890',
    cccdIssueDate: '2015-06-01',
    cccdIssuePlace: 'Cục Cảnh sát QLHC về TTXH',
    email: spec.email,
    phone: '0900000001',
    address: '123 Test Street, Quận 1, TP.HCM',
  };

  const documents = {
    cccdFront,
    cccdBack,
    selfie,
  };

  const businessProfile = {
    interests: ['GAME_CARD', 'PHONE_CARD'],
    expectedVolume: '100-500',
    hasExistingSystem: true,
    programmingLanguages: ['NODEJS', 'PHP'],
    acceptTerms: true,
    acceptPrivacy: true,
    acceptLegalCommitment: true,
  };

  await prisma.agentKyc.upsert({
    where: { agentId: agent.id },
    update: {
      status: spec.kycStatus,
      accountType: spec.accountType,
      profile,
      documents,
      businessProfile,
      companyName: spec.fullName,
      taxCode: profile.cccd,
      representativeName: spec.fullName,
      documentFront: cccdFront,
      documentBack: cccdBack,
      businessLicense: selfie,
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
      requestedFields: null,
    },
    create: {
      agentId: agent.id,
      status: spec.kycStatus,
      accountType: spec.accountType,
      profile,
      documents,
      businessProfile,
      companyName: spec.fullName,
      taxCode: profile.cccd,
      representativeName: spec.fullName,
      documentFront: cccdFront,
      documentBack: cccdBack,
      businessLicense: selfie,
    },
  });

  console.log(
    `[local-dev-kyc] ${spec.email} — KYC ${spec.kycStatus} (xem/duyệt trên Admin → Đại lý → Chi tiết → Thông tin)`,
  );
}

async function main() {
  const appEnv = process.env.APP_ENV ?? 'development';
  if (!['staging', 'development', 'local', 'test'].includes(appEnv)) {
    console.error(`[local-dev-kyc] Refusing to run in APP_ENV=${appEnv}`);
    process.exit(1);
  }

  const extraEmails = process.argv.slice(2);
  const envEmails = (process.env.LOCAL_DEV_VERIFY_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  const allExtra = [...new Set([...extraEmails, ...envEmails])];

  console.log('[local-dev-kyc] Verifying agent emails for local testing...');
  await verifyAgentEmails(allExtra);

  const superAdmin = await prisma.user.findFirst({
    where: { role: UserRole.SUPER_ADMIN, deletedAt: null },
    select: { id: true },
  });
  if (!superAdmin) {
    console.warn('[local-dev-kyc] No super admin found — run seed-local-full first');
  }

  console.log('[local-dev-kyc] Ensuring KYC test accounts...');
  await ensureKycTestAccount(KYC_TEST_ACCOUNTS.draft, superAdmin?.id ?? '');
  await ensureKycTestAccount(KYC_TEST_ACCOUNTS.submitted, superAdmin?.id ?? '');

  console.log('');
  console.log('=== Local KYC test credentials (password: LocalTest2026!) ===');
  console.log('  kyc-draft@test.local    — email verified, chưa nộp KYC');
  console.log('  kyc-review@test.local   — KYC SUBMITTED, có ảnh test');
  console.log('  agent@test.local        — KYC APPROVED (chạy seed-local-full)');
  console.log('');
  console.log('Partner: http://partner.localhost');
  console.log('Admin:   http://admin.localhost');
}

main()
  .catch((err) => {
    console.error('[local-dev-kyc] Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
