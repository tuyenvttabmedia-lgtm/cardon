/**
 * Phase 6E — Local full deployment bootstrap.
 * Upserts test accounts + demo catalog (Mock eSale). Does NOT truncate tables.
 *
 * Usage:
 *   docker exec cardon-local-full-api node --experimental-strip-types /app/scripts/seed-local-full.ts
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
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();

const AGENT_API_KEY_PREFIX = 'ak_';
const AGENT_SECRET_KEY_PREFIX = 'sk_';

const PASSWORD = process.env.LOCAL_FULL_PASSWORD ?? 'LocalTest2026!';
const SUPER_PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'SuperAdmin2026!';

const ACCOUNTS = {
  superAdmin: { email: 'superadmin@cardon.vn', role: UserRole.SUPER_ADMIN, password: SUPER_PASSWORD },
  support: { email: 'support@test.local', role: UserRole.SUPPORT, password: PASSWORD },
  marketing: { email: 'marketing@test.local', role: UserRole.MARKETING, password: PASSWORD },
  accountant: { email: 'accountant@test.local', role: UserRole.ACCOUNTANT, password: PASSWORD },
  customer: { email: 'customer@test.local', role: UserRole.CUSTOMER, password: PASSWORD },
  agent: { email: 'agent@test.local', role: UserRole.AGENT, password: PASSWORD },
};

const CATALOG = {
  providerCode: 'ESALE',
  categorySlug: 'local-demo-cards',
  topupCategorySlug: 'local-demo-topup',
  cardFaceValue: 100_000,
  cardSellPrice: 100_000,
  cardProviderCost: 95_000,
  topupFaceValue: 50_000,
  topupSellPrice: 50_000,
  topupProviderCost: 48_000,
  cardProducts: [
    {
      slug: 'viettel-card',
      name: 'Viettel Card',
      variantSku: 'VIETTEL-100K',
      variantName: 'Viettel 100k',
      providerProductCode: 'VIETTEL|100000|Card',
      type: 'CARD' as const,
    },
    {
      slug: 'garena-card',
      name: 'Garena Card',
      variantSku: 'GARENA-100K',
      variantName: 'Garena 100k',
      providerProductCode: 'GARENA|100000|Card',
      type: 'CARD' as const,
    },
    {
      slug: 'zing-card',
      name: 'Zing Card',
      variantSku: 'ZING-100K',
      variantName: 'Zing 100k',
      providerProductCode: 'ZING|100000|Card',
      type: 'CARD' as const,
    },
  ],
  topupProducts: [
    {
      slug: 'viettel-topup',
      name: 'Nạp Viettel',
      variantSku: 'VIETTEL-TOPUP-50K',
      variantName: 'Viettel 50k',
      providerProductCode: 'viettel:50000',
      type: 'TOPUP' as const,
    },
    {
      slug: 'mobifone-topup',
      name: 'Nạp Mobifone',
      variantSku: 'MOBIFONE-TOPUP-50K',
      variantName: 'Mobifone 50k',
      providerProductCode: 'mobi:50000',
      type: 'TOPUP' as const,
    },
    {
      slug: 'vinaphone-topup',
      name: 'Nạp Vinaphone',
      variantSku: 'VINAPHONE-TOPUP-50K',
      variantName: 'Vinaphone 50k',
      providerProductCode: 'vina:50000',
      type: 'TOPUP' as const,
    },
  ],
};

type CatalogItem = (typeof CATALOG.cardProducts)[number] | (typeof CATALOG.topupProducts)[number];

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

async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

async function upsertUser(
  email: string,
  role: UserRole,
  password: string,
  extra?: { fullName?: string; username?: string },
) {
  const passwordHash = await hashPassword(password);
  const verifiedAt = role === UserRole.AGENT ? new Date() : undefined;
  return prisma.user.upsert({
    where: { email },
    update: {
      role,
      status: UserStatus.ACTIVE,
      passwordHash,
      fullName: extra?.fullName,
      username: extra?.username,
      ...(verifiedAt ? { emailVerifiedAt: verifiedAt } : {}),
    },
    create: {
      email,
      passwordHash,
      role,
      status: UserStatus.ACTIVE,
      fullName: extra?.fullName,
      username: extra?.username,
      emailVerifiedAt: verifiedAt ?? null,
    },
  });
}

async function ensureCatalog() {
  const provider = await prisma.provider.upsert({
    where: { code: CATALOG.providerCode },
    update: { status: 'ACTIVE', name: 'eSale (Mock Local Full)', balance: 10_000_000 },
    create: {
      code: CATALOG.providerCode,
      name: 'eSale (Mock Local Full)',
      status: 'ACTIVE',
      apiCredentials: '{}',
      balance: 10_000_000,
    },
  });

  const gameRoot = await prisma.productCategory.upsert({
    where: { slug: 'game-card' },
    update: { name: 'Thẻ game', status: 'ACTIVE', homeService: 'GAME_CARD' },
    create: { slug: 'game-card', name: 'Thẻ game', status: 'ACTIVE', sortOrder: 0, homeService: 'GAME_CARD' },
  });

  const phoneRoot = await prisma.productCategory.upsert({
    where: { slug: 'phone-card' },
    update: { name: 'Thẻ điện thoại', status: 'ACTIVE', homeService: 'PHONE_CARD' },
    create: { slug: 'phone-card', name: 'Thẻ điện thoại', status: 'ACTIVE', sortOrder: 1, homeService: 'PHONE_CARD' },
  });

  const topupRoot = await prisma.productCategory.upsert({
    where: { slug: 'topup' },
    update: { name: 'Nạp cước', status: 'ACTIVE', homeService: 'TOPUP' },
    create: { slug: 'topup', name: 'Nạp cước', status: 'ACTIVE', sortOrder: 2, homeService: 'TOPUP' },
  });

  const dataRoot = await prisma.productCategory.upsert({
    where: { slug: 'data' },
    update: { name: 'Nạp Data', status: 'ACTIVE', homeService: 'DATA' },
    create: { slug: 'data', name: 'Nạp Data', status: 'ACTIVE', sortOrder: 3, homeService: 'DATA' },
  });

  const variantIds: string[] = [];

  const seedItems: Array<{ item: CatalogItem; categoryId: string; homeService: 'GAME_CARD' | 'PHONE_CARD' | 'TOPUP' }> = [
    ...CATALOG.cardProducts.map((item) => ({
      item,
      categoryId: item.slug.includes('viettel') ? phoneRoot.id : gameRoot.id,
      homeService: item.slug.includes('viettel') ? 'PHONE_CARD' as const : 'GAME_CARD' as const,
    })),
    ...CATALOG.topupProducts.map((item) => ({
      item,
      categoryId: topupRoot.id,
      homeService: 'TOPUP' as const,
    })),
  ];

  for (const { item, categoryId, homeService } of seedItems) {
    const isTopup = item.type === 'TOPUP';
    const faceValue = isTopup ? CATALOG.topupFaceValue : CATALOG.cardFaceValue;
    const sellPrice = isTopup ? CATALOG.topupSellPrice : CATALOG.cardSellPrice;
    const providerCost = isTopup ? CATALOG.topupProviderCost : CATALOG.cardProviderCost;

    const product = await prisma.product.upsert({
      where: { slug: item.slug },
      update: { name: item.name, status: 'ACTIVE', categoryId, homeService },
      create: {
        slug: item.slug,
        name: item.name,
        status: 'ACTIVE',
        categoryId,
        homeService,
      },
    });

    const variant = await prisma.productVariant.upsert({
      where: { sku: item.variantSku },
      update: {
        name: item.variantName,
        status: 'ACTIVE',
        type: item.type,
        faceValue,
        sellPrice,
        productId: product.id,
      },
      create: {
        sku: item.variantSku,
        name: item.variantName,
        status: 'ACTIVE',
        type: item.type,
        faceValue,
        sellPrice,
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
        providerProductCode: item.providerProductCode,
        providerCost,
        priority: 1,
      },
      create: {
        providerId: provider.id,
        productVariantId: variant.id,
        status: 'ACTIVE',
        providerProductCode: item.providerProductCode,
        providerCost,
        priority: 1,
      },
    });

    variantIds.push(variant.id);
  }

  return { providerId: provider.id, variantIds };
}

async function creditAgentBalance(agentId: string, amount: number) {
  const targetBalance = new Decimal(amount);
  await prisma.$transaction(async (tx) => {
    const agent = await tx.agent.findFirst({ where: { id: agentId, deletedAt: null } });
    if (!agent) throw new Error(`Agent ${agentId} not found`);
    const delta = targetBalance.sub(agent.balance);
    if (delta.lte(0)) return;
    const afterBalance = agent.balance.add(delta);
    await tx.agent.update({
      where: { id: agentId },
      data: { balance: afterBalance },
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
        description: 'Local full deploy initial balance',
      },
    });
  });
}

async function ensureAgent(superAdminId: string) {
  const user = await upsertUser(
    ACCOUNTS.agent.email,
    UserRole.AGENT,
    ACCOUNTS.agent.password,
    { fullName: 'Demo Agent', username: 'demoagent' },
  );

  const credentials = generateAgentCredentials();
  const agent = await prisma.agent.upsert({
    where: { userId: user.id },
    update: {
      companyName: 'Demo Agent Co., Ltd',
      status: AgentStatus.ACTIVE,
      apiEnabled: true,
      apiKeyHash: credentials.apiKeyHash,
      apiKeyLookup: credentials.apiKeyLookup,
      secretKeyEncrypted: credentials.secretKeyEncrypted,
      contactEmail: ACCOUNTS.agent.email,
    },
    create: {
      userId: user.id,
      companyName: 'Demo Agent Co., Ltd',
      status: AgentStatus.ACTIVE,
      apiEnabled: true,
      apiKeyHash: credentials.apiKeyHash,
      apiKeyLookup: credentials.apiKeyLookup,
      secretKeyEncrypted: credentials.secretKeyEncrypted,
      contactEmail: ACCOUNTS.agent.email,
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

  await creditAgentBalance(agent.id, 10_000_000);
  return credentials;
}

async function verifyPermissions() {
  const required = ['cards.reveal', 'users.manage', 'customers.manage'];
  const found = await prisma.permission.findMany({
    where: { code: { in: required } },
    select: { code: true },
  });
  const codes = found.map((p) => p.code);
  for (const code of required) {
    if (!codes.includes(code)) {
      throw new Error(`Missing permission after seed: ${code}`);
    }
  }
  console.log(`[seed-local-full] Verified permissions: ${codes.join(', ')}`);
}

function writeCredentials(payload: Record<string, unknown>) {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const outPath = join(scriptDir, '.local-full-credentials.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return outPath;
}

const SYSTEM_AUDIT_EMAIL = 'system@cardon.local';

async function ensureSystemAuditActor(password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email: SYSTEM_AUDIT_EMAIL },
    update: {
      role: UserRole.ADMIN,
      status: 'ACTIVE',
      passwordHash,
    },
    create: {
      email: SYSTEM_AUDIT_EMAIL,
      passwordHash,
      role: UserRole.ADMIN,
      status: 'ACTIVE',
      fullName: 'System Provider Audit',
    },
  });
  console.log(`Seeding provider audit actor (${SYSTEM_AUDIT_EMAIL})...`);
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
    `[seed-local-full] Reset ${zombies.length} zombie PROCESSING order(s): ${zombies.map((z) => z.orderCode).join(', ')}`,
  );
}

async function ensureAgentRegistrationMode() {
  const key = 'settings.system';
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  const base =
    row?.value && typeof row.value === 'object' && !Array.isArray(row.value)
      ? (row.value as Record<string, unknown>)
      : {
          siteName: 'CardOn.vn',
          publicUrl: process.env.APP_PUBLIC_URL ?? 'http://localhost',
          customerTopupEnabled: true,
          agentLowBalanceThreshold: 100_000,
          providerLowBalanceThreshold: 500_000,
        };

  await prisma.systemSetting.upsert({
    where: { key },
    update: {
      value: { ...base, agentRegistrationMode: 'PUBLIC_APPROVAL' },
    },
    create: {
      key,
      value: { ...base, agentRegistrationMode: 'PUBLIC_APPROVAL' },
      description: 'System configuration (site, thresholds, registration mode)',
    },
  });
  console.log('[seed-local-full] agentRegistrationMode = PUBLIC_APPROVAL');
}

async function main() {
  console.log('[seed-local-full] Running base RBAC + system settings seed...');
  execSync('node prisma/seed.mjs', { stdio: 'inherit' });

  console.log('[seed-local-full] Ensuring public agent registration mode...');
  await ensureAgentRegistrationMode();

  console.log('[seed-local-full] Creating staff + customer accounts...');
  const superAdmin = await upsertUser(
    ACCOUNTS.superAdmin.email,
    ACCOUNTS.superAdmin.role,
    ACCOUNTS.superAdmin.password,
    { fullName: 'Super Admin' },
  );
  await upsertUser(ACCOUNTS.support.email, ACCOUNTS.support.role, ACCOUNTS.support.password, {
    fullName: 'Support User',
  });
  await upsertUser(ACCOUNTS.marketing.email, ACCOUNTS.marketing.role, ACCOUNTS.marketing.password, {
    fullName: 'Marketing User',
  });
  await upsertUser(
    ACCOUNTS.accountant.email,
    ACCOUNTS.accountant.role,
    ACCOUNTS.accountant.password,
    { fullName: 'Accountant User' },
  );
  await upsertUser(ACCOUNTS.customer.email, ACCOUNTS.customer.role, ACCOUNTS.customer.password, {
    fullName: 'Demo Customer',
    username: 'democustomer',
  });

  console.log('[seed-local-full] Ensuring provider audit system actor...');
  await ensureSystemAuditActor(SUPER_PASSWORD);
  await resetZombieProcessingOrders();

  console.log('[seed-local-full] Seeding catalog (CARD: Viettel/Garena/Zing + TOPUP: Viettel/Mobi/Vina)...');
  const catalog = await ensureCatalog();

  console.log('[seed-local-full] Creating agent + API credentials...');
  const agentCreds = await ensureAgent(superAdmin.id);

  await verifyPermissions();

  const doc = {
    generatedAt: new Date().toISOString(),
    urls: {
      customer: 'http://localhost',
      partner: 'http://partner.localhost',
      admin: 'http://admin.localhost',
      api: 'http://localhost/api/v1',
    },
    accounts: {
      superAdmin: { email: ACCOUNTS.superAdmin.email, password: SUPER_PASSWORD },
      support: { email: ACCOUNTS.support.email, password: PASSWORD },
      marketing: { email: ACCOUNTS.marketing.email, password: PASSWORD },
      accountant: { email: ACCOUNTS.accountant.email, password: PASSWORD },
      customer: { email: ACCOUNTS.customer.email, password: PASSWORD },
      agent: {
        email: ACCOUNTS.agent.email,
        password: PASSWORD,
        apiKey: agentCreds.apiKey,
        secretKey: agentCreds.secretKey,
      },
    },
    catalog: {
      skus: [...CATALOG.cardProducts, ...CATALOG.topupProducts].map((p) => p.variantSku),
      variantIds: catalog.variantIds,
      providerCode: CATALOG.providerCode,
    },
    payment: {
      sepayWebhookHeader: `Authorization: Apikey ${process.env.SEPAY_API_KEY ?? 'local-sepay-api-key-sim'}`,
    },
  };

  const outPath = writeCredentials(doc);
  console.log(`[seed-local-full] Credentials written: ${outPath}`);
  console.log('[seed-local-full] Done.');
}

main()
  .catch((error) => {
    console.error('[seed-local-full] Failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
