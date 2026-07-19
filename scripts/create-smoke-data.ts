/**
 * Phase 6B.1 — One-time smoke test data bootstrap.
 * Does NOT run automatically. Does NOT reset/truncate production tables.
 *
 * Usage (host, postgres on 5433):
 *   set DATABASE_URL=postgresql://cardon:...@127.0.0.1:5433/cardon?schema=public
 *   set ENCRYPTION_KEY=<same as .env.local-production>
 *   node --experimental-strip-types scripts/create-smoke-data.ts
 *
 * Or via Docker:
 *   docker exec cardon-prod-api node --experimental-strip-types /app/scripts/create-smoke-data.ts
 *
 * Writes credentials to scripts/.smoke-credentials.json (gitignored).
 */
import {
  AgentKycStatus,
  AgentStatus,
  LedgerEntryType,
  LedgerReferenceType,
  PrismaClient,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import bcrypt from 'bcryptjs';
import {
  createCipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();

const AGENT_API_KEY_PREFIX = 'ak_';
const AGENT_SECRET_KEY_PREFIX = 'sk_';

const SMOKE = {
  adminEmail: process.env.LOCAL_ADMIN_EMAIL ?? 'superadmin@cardon.vn',
  adminPassword: process.env.LOCAL_ADMIN_PASSWORD ?? 'ChangeMe123!',
  systemAuditEmail: process.env.SMOKE_SYSTEM_AUDIT_EMAIL ?? 'system@cardon.local',
  customerEmail: process.env.SMOKE_CUSTOMER_EMAIL ?? 'customer@smoke.test',
  agentEmail: process.env.SMOKE_AGENT_EMAIL ?? 'agent@smoke.test',
  password: process.env.SMOKE_PASSWORD ?? 'ChangeMe123!',
  agentCompany: 'Smoke Test Agent Co., Ltd',
  agentBalance: 10_000_000,
  providerCode: 'ESALE',
  categorySlug: 'smoke-game-cards',
  productSlug: 'smoke-zing-card',
  variantSku: 'SMOKE-ZING-100K',
  variantName: 'Zing 100K (Smoke)',
  faceValue: 100_000,
  sellPrice: 100_000,
  providerCost: 95_000,
  providerProductCode: 'ZING|100000|Card',
};

function hashApiKeyForLookup(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

function deriveEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error('ENCRYPTION_KEY env var required (min 32 chars, match .env.local-production)');
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

async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

async function ensureSuperAdmin() {
  const passwordHash = await hashPassword(SMOKE.adminPassword);
  await prisma.user.upsert({
    where: { email: SMOKE.adminEmail },
    update: {
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash,
    },
    create: {
      email: SMOKE.adminEmail,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    },
  });
}

/** Provider audit requires SYSTEM_PROVIDER_AUDIT_EMAIL (see provider.constants.ts). */
async function ensureSystemAuditActor() {
  const passwordHash = await hashPassword(SMOKE.adminPassword);
  await prisma.user.upsert({
    where: { email: SMOKE.systemAuditEmail },
    update: {
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      passwordHash,
    },
    create: {
      email: SMOKE.systemAuditEmail,
      passwordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });
}

async function resetZombieProcessingOrders() {
  const zombies = await prisma.order.findMany({
    where: {
      fulfillmentStatus: 'PROCESSING',
      deletedAt: null,
      providerTransactions: { none: {} },
    },
    select: { id: true, orderCode: true },
  });
  if (zombies.length === 0) {
    return;
  }
  await prisma.order.updateMany({
    where: { id: { in: zombies.map((z) => z.id) } },
    data: { fulfillmentStatus: 'PENDING' },
  });
  console.log(
    `[create-smoke-data] Reset ${zombies.length} zombie PROCESSING order(s): ${zombies.map((z) => z.orderCode).join(', ')}`,
  );
}

async function ensureCustomer() {
  const passwordHash = await hashPassword(SMOKE.password);
  const user = await prisma.user.upsert({
    where: { email: SMOKE.customerEmail },
    update: {
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      passwordHash,
    },
    create: {
      email: SMOKE.customerEmail,
      passwordHash,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
    },
  });
  return user.id;
}

async function ensureCatalog() {
  const provider = await prisma.provider.upsert({
    where: { code: SMOKE.providerCode },
    update: { status: 'ACTIVE', name: 'eSale (Smoke Mock)' },
    create: {
      code: SMOKE.providerCode,
      name: 'eSale (Smoke Mock)',
      status: 'ACTIVE',
      apiCredentials: '{}',
      balance: 10_000_000,
    },
  });

  const category = await prisma.productCategory.upsert({
    where: { slug: SMOKE.categorySlug },
    update: { name: 'Smoke Game Cards', status: 'ACTIVE' },
    create: {
      slug: SMOKE.categorySlug,
      name: 'Smoke Game Cards',
      status: 'ACTIVE',
      sortOrder: 1,
    },
  });

  const product = await prisma.product.upsert({
    where: { slug: SMOKE.productSlug },
    update: {
      name: 'Zing Card (Smoke E2E)',
      status: 'ACTIVE',
      categoryId: category.id,
    },
    create: {
      slug: SMOKE.productSlug,
      name: 'Zing Card (Smoke E2E)',
      status: 'ACTIVE',
      categoryId: category.id,
    },
  });

  const variant = await prisma.productVariant.upsert({
    where: { sku: SMOKE.variantSku },
    update: {
      name: SMOKE.variantName,
      status: 'ACTIVE',
      type: 'CARD',
      faceValue: SMOKE.faceValue,
      sellPrice: SMOKE.sellPrice,
      productId: product.id,
    },
    create: {
      sku: SMOKE.variantSku,
      name: SMOKE.variantName,
      status: 'ACTIVE',
      type: 'CARD',
      faceValue: SMOKE.faceValue,
      sellPrice: SMOKE.sellPrice,
      productId: product.id,
    },
  });

  await prisma.providerProductMapping.upsert({
    where: {
      providerId_productVariantId: {
        providerId: provider.id,
        productVariantId: variant.id,
      },
    },
    update: {
      status: 'ACTIVE',
      providerProductCode: SMOKE.providerProductCode,
      providerCost: SMOKE.providerCost,
      priority: 1,
    },
    create: {
      providerId: provider.id,
      productVariantId: variant.id,
      status: 'ACTIVE',
      providerProductCode: SMOKE.providerProductCode,
      providerCost: SMOKE.providerCost,
      priority: 1,
    },
  });

  return { providerId: provider.id, variantId: variant.id };
}

async function creditAgentBalance(agentId: string, amount: number) {
  const creditAmount = new Decimal(amount);
  await prisma.$transaction(async (tx) => {
    const agent = await tx.agent.findFirst({
      where: { id: agentId, deletedAt: null },
    });
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const targetBalance = new Decimal(amount);
    const delta = targetBalance.sub(agent.balance);
    if (delta.lte(0)) {
      return;
    }

    const afterBalance = agent.balance.add(delta);
    await tx.agent.update({
      where: { id: agentId },
      data: { balance: afterBalance, heldBalance: agent.heldBalance },
    });

    await tx.ledgerEntry.create({
      data: {
        agentId,
        type: LedgerEntryType.CREDIT,
        beforeBalance: agent.balance,
        beforeHeld: agent.heldBalance,
        amount: delta,
        afterBalance,
        afterHeld: agent.heldBalance,
        referenceType: LedgerReferenceType.ADJUSTMENT,
        referenceId: randomUUID(),
        description: 'Smoke test initial balance',
      },
    });
  });
}

async function ensureAgent(superAdminId: string) {
  const passwordHash = await hashPassword(SMOKE.password);
  const user = await prisma.user.upsert({
    where: { email: SMOKE.agentEmail },
    update: {
      role: UserRole.AGENT,
      status: UserStatus.ACTIVE,
      passwordHash,
    },
    create: {
      email: SMOKE.agentEmail,
      passwordHash,
      role: UserRole.AGENT,
      status: UserStatus.ACTIVE,
    },
  });

  const credentials = generateAgentCredentials();

  const agent = await prisma.agent.upsert({
    where: { userId: user.id },
    update: {
      companyName: SMOKE.agentCompany,
      status: AgentStatus.ACTIVE,
      apiEnabled: true,
      apiKeyHash: credentials.apiKeyHash,
      apiKeyLookup: credentials.apiKeyLookup,
      secretKeyEncrypted: credentials.secretKeyEncrypted,
      contactEmail: SMOKE.agentEmail,
    },
    create: {
      userId: user.id,
      companyName: SMOKE.agentCompany,
      status: AgentStatus.ACTIVE,
      apiEnabled: true,
      apiKeyHash: credentials.apiKeyHash,
      apiKeyLookup: credentials.apiKeyLookup,
      secretKeyEncrypted: credentials.secretKeyEncrypted,
      contactEmail: SMOKE.agentEmail,
    },
  });

  await prisma.agentKyc.upsert({
    where: { agentId: agent.id },
    update: {
      companyName: SMOKE.agentCompany,
      taxCode: '0123456789',
      representativeName: 'Smoke Agent Rep',
      documentFront: 'smoke/doc-front.pdf',
      documentBack: 'smoke/doc-back.pdf',
      businessLicense: 'smoke/license.pdf',
      status: AgentKycStatus.APPROVED,
      reviewedById: superAdminId,
      reviewedAt: new Date(),
    },
    create: {
      agentId: agent.id,
      companyName: SMOKE.agentCompany,
      taxCode: '0123456789',
      representativeName: 'Smoke Agent Rep',
      documentFront: 'smoke/doc-front.pdf',
      documentBack: 'smoke/doc-back.pdf',
      businessLicense: 'smoke/license.pdf',
      status: AgentKycStatus.APPROVED,
      reviewedById: superAdminId,
      reviewedAt: new Date(),
    },
  });

  await creditAgentBalance(agent.id, SMOKE.agentBalance);

  return { agentId: agent.id, ...credentials };
}

async function ensureSystemSettings() {
  await prisma.systemSetting.upsert({
    where: { key: 'payment.timeout_minutes' },
    update: { value: 15 },
    create: {
      key: 'payment.timeout_minutes',
      value: 15,
      description: 'Smoke — payment window minutes',
    },
  });
}

function writeCredentials(payload: Record<string, unknown>) {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const outPath = join(scriptDir, '.smoke-credentials.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return outPath;
}

async function main() {
  console.log('[create-smoke-data] Ensuring system settings...');
  await ensureSystemSettings();

  console.log('[create-smoke-data] Ensuring super admin audit actor...');
  await ensureSuperAdmin();
  console.log('[create-smoke-data] Ensuring provider system audit actor...');
  await ensureSystemAuditActor();
  console.log('[create-smoke-data] Resetting zombie PROCESSING orders (smoke cleanup)...');
  await resetZombieProcessingOrders();
  const admin = await prisma.user.findUnique({
    where: { email: SMOKE.adminEmail },
    select: { id: true },
  });
  if (!admin) {
    throw new Error('Super admin user missing after upsert');
  }

  console.log('[create-smoke-data] Ensuring test customer...');
  await ensureCustomer();

  console.log('[create-smoke-data] Ensuring catalog + provider mappings...');
  const catalog = await ensureCatalog();

  console.log('[create-smoke-data] Ensuring test agent (ACTIVE KYC + API credentials + balance)...');
  const agent = await ensureAgent(admin.id);

  const credentials = {
    generatedAt: new Date().toISOString(),
    baseUrl: process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1',
    admin: {
      email: SMOKE.adminEmail,
      password: SMOKE.adminPassword,
    },
    customer: {
      email: SMOKE.customerEmail,
      password: SMOKE.password,
    },
    agent: {
      email: SMOKE.agentEmail,
      password: SMOKE.password,
      agentId: agent.agentId,
      apiKey: agent.apiKey,
      secretKey: agent.secretKey,
      initialBalance: SMOKE.agentBalance,
    },
    catalog: {
      variantSku: SMOKE.variantSku,
      variantId: catalog.variantId,
      providerId: catalog.providerId,
      providerCode: SMOKE.providerCode,
    },
    payment: {
      sepayApiKey: process.env.SEPAY_API_KEY ?? 'local-sepay-api-key-sim',
    },
  };

  const outPath = writeCredentials(credentials);
  console.log(`[create-smoke-data] Credentials written: ${outPath}`);
  console.log('[create-smoke-data] Done — existing rows upserted only, no table reset.');
}

main()
  .catch((error) => {
    console.error('[create-smoke-data] Failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
