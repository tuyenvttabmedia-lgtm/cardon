import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const row = await prisma.systemSetting.findUnique({
    where: { key: 'settings.payment.sepay' },
  });
  if (!row) {
    console.log('NO_SETTINGS_ROW');
    return;
  }
  const value = row.value;
  const obj =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  console.log(
    JSON.stringify(
      {
        keys: Object.keys(obj),
        integrationMode: obj.integrationMode ?? null,
        merchantId: obj.merchantId ?? null,
        environment: obj.environment ?? null,
        enabled: obj.enabled ?? null,
        hasSecretKeyEnc: Boolean(obj.secretKeyEnc),
        hasWebhookSecretEnc: Boolean(obj.webhookSecretEnc),
        hasApiKeyEnc: Boolean(obj.apiKeyEnc),
        bankAccount: obj.bankAccount ?? null,
      },
      null,
      2,
    ),
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
