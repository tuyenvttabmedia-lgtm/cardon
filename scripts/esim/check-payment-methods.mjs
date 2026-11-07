import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const keys = [
  'settings.payment.sepay',
  'settings.payment.megapay',
  'settings.payment.methods',
  'settings.payment.gateway.sepay',
  'settings.payment.gateway.megapay',
];
const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
for (const row of rows) {
  const value = row.value;
  const cloned =
    value && typeof value === 'object'
      ? JSON.parse(JSON.stringify(value))
      : value;
  if (cloned && typeof cloned === 'object') {
    for (const secret of ['apiKeyEnc', 'secretKeyEnc', 'webhookSecretEnc', 'privateKeyEnc']) {
      if (cloned[secret]) cloned[secret] = '***';
    }
    if (Array.isArray(cloned.methods)) {
      cloned.methods = cloned.methods.map((m) => ({
        methodCode: m.methodCode,
        gatewayCode: m.gatewayCode,
        enabled: m.enabled,
        displayName: m.displayName,
      }));
    }
  }
  console.log(row.key, JSON.stringify(cloned, null, 2));
}
await prisma.$disconnect();
