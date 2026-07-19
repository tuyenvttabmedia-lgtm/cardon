/**
 * Reset local SUPER_ADMIN + portal test accounts for manual acceptance.
 * Does NOT truncate data — upserts RBAC, password, and ACTIVE status.
 *
 * Usage (host):
 *   npm run reset:local-admin
 *
 * Docker (prod sim stack):
 *   docker exec cardon-prod-api node --experimental-strip-types /app/scripts/reset-local-admin.ts
 *
 * Docker (local-full stack):
 *   docker exec cardon-local-full-api node --experimental-strip-types /app/scripts/reset-local-admin.ts
 */
import {
  AgentKycStatus,
  AgentStatus,
  PrismaClient,
  UserRole,
  UserStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  createCipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { ensurePermissions, ensureSuperAdmin } from './create-admin-local.ts';

const prisma = new PrismaClient();

const PORTAL_PASSWORD = process.env.LOCAL_FULL_PASSWORD ?? 'LocalTest2026!';

const AGENT_API_KEY_PREFIX = 'ak_';
const AGENT_SECRET_KEY_PREFIX = 'sk_';

function hashApiKeyForLookup(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

function deriveEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error('ENCRYPTION_KEY required (min 32 chars)');
  }
  return createHash('sha256').update(secret).digest();
}

function encryptSecret(plaintext: string): string {
  const key = deriveEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function generateAgentCredentials() {
  const apiKey = `${AGENT_API_KEY_PREFIX}${randomBytes(24).toString('hex')}`;
  const secretKey = `${AGENT_SECRET_KEY_PREFIX}${randomBytes(32).toString('hex')}`;
  return {
    apiKey,
    secretKey,
    apiKeyHash: bcrypt.hashSync(apiKey, 12),
    apiKeyLookup: hashApiKeyForLookup(apiKey),
    secretKeyEncrypted: encryptSecret(secretKey),
  };
}

async function upsertPortalUser(
  email: string,
  role: UserRole,
  password: string,
  extra?: { fullName?: string; username?: string },
) {
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.upsert({
    where: { email },
    update: {
      role,
      status: UserStatus.ACTIVE,
      passwordHash,
      fullName: extra?.fullName,
      username: extra?.username,
    },
    create: {
      email,
      passwordHash,
      role,
      status: UserStatus.ACTIVE,
      fullName: extra?.fullName,
      username: extra?.username,
    },
  });
}

async function ensurePortalTestAccounts(superAdminId: string) {
  await upsertPortalUser('customer@test.local', UserRole.CUSTOMER, PORTAL_PASSWORD, {
    fullName: 'Demo Customer',
    username: 'democustomer',
  });
  console.log('[reset-local-admin] CUSTOMER ready: customer@test.local');

  const agentUser = await upsertPortalUser('agent@test.local', UserRole.AGENT, PORTAL_PASSWORD, {
    fullName: 'Demo Agent',
    username: 'demoagent',
  });

  const credentials = generateAgentCredentials();
  const agent = await prisma.agent.upsert({
    where: { userId: agentUser.id },
    update: {
      companyName: 'Demo Agent Co., Ltd',
      status: AgentStatus.ACTIVE,
      apiEnabled: true,
      apiKeyHash: credentials.apiKeyHash,
      apiKeyLookup: credentials.apiKeyLookup,
      secretKeyEncrypted: credentials.secretKeyEncrypted,
      contactEmail: agentUser.email,
    },
    create: {
      userId: agentUser.id,
      companyName: 'Demo Agent Co., Ltd',
      status: AgentStatus.ACTIVE,
      apiEnabled: true,
      apiKeyHash: credentials.apiKeyHash,
      apiKeyLookup: credentials.apiKeyLookup,
      secretKeyEncrypted: credentials.secretKeyEncrypted,
      contactEmail: agentUser.email,
    },
  });

  await prisma.agentKyc.upsert({
    where: { agentId: agent.id },
    update: {
      companyName: 'Demo Agent Co., Ltd',
      taxCode: '0123456789',
      representativeName: 'Demo Rep',
      documentFront: 'local/doc-front.pdf',
      documentBack: 'local/doc-back.pdf',
      businessLicense: 'local/license.pdf',
      status: AgentKycStatus.APPROVED,
      reviewedById: superAdminId,
      reviewedAt: new Date(),
    },
    create: {
      agentId: agent.id,
      companyName: 'Demo Agent Co., Ltd',
      taxCode: '0123456789',
      representativeName: 'Demo Rep',
      documentFront: 'local/doc-front.pdf',
      documentBack: 'local/doc-back.pdf',
      businessLicense: 'local/license.pdf',
      status: AgentKycStatus.APPROVED,
      reviewedById: superAdminId,
      reviewedAt: new Date(),
    },
  });

  console.log('[reset-local-admin] AGENT ready: agent@test.local');
}

async function verifySuperAdminPermissions() {
  const required = ['users.manage', 'customers.read', 'admin.dashboard', 'cms.manage'];
  const rows = await prisma.rolePermission.findMany({
    where: { role: UserRole.SUPER_ADMIN },
    include: { permission: true },
  });
  const codes = new Set(rows.map((row) => row.permission.code));
  for (const code of required) {
    if (!codes.has(code)) {
      throw new Error(`SUPER_ADMIN missing permission: ${code}`);
    }
  }
  console.log(`[reset-local-admin] SUPER_ADMIN permissions OK (${codes.size} total)`);
}

async function main() {
  console.log('[reset-local-admin] Restoring RBAC permissions...');
  await ensurePermissions();

  console.log('[reset-local-admin] Resetting SUPER_ADMIN account...');
  const email = await ensureSuperAdmin();
  console.log(`[reset-local-admin] SUPER_ADMIN: ${email}`);

  const superAdmin = await prisma.user.findFirstOrThrow({
    where: { email, deletedAt: null },
    select: { id: true },
  });

  console.log('[reset-local-admin] Ensuring portal test accounts...');
  await ensurePortalTestAccounts(superAdmin.id);

  await verifySuperAdminPermissions();

  console.log('[reset-local-admin] Done.');
  console.log(`  Admin:    ${email} / SuperAdmin2026!`);
  console.log('  Customer: customer@test.local / LocalTest2026!');
  console.log('  Partner:  agent@test.local / LocalTest2026!');
}

main()
  .catch((error) => {
    console.error('[reset-local-admin] Failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
