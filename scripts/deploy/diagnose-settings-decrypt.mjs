import { createDecipheriv, createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function tryDecrypt(enc) {
  try {
    const secret = process.env.ENCRYPTION_KEY;
    const key = createHash('sha256').update(secret).digest();
    const [ivB64, tagB64, dataB64] = enc.split(':');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return {
      ok: true,
      preview: Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64')),
        decipher.final(),
      ])
        .toString('utf8')
        .slice(0, 20),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  const keys = [
    'settings.payment.sepay',
    'settings.payment.megapay',
    'settings.smtp',
    'settings.provider.esale',
    'settings.telegram',
  ];
  for (const key of keys) {
    const row = await prisma.systemSetting.findUnique({ where: { key } });
    const value = row?.value;
    if (!value || typeof value !== 'object') {
      console.log(JSON.stringify({ key, status: 'missing' }));
      continue;
    }
    const encFields = Object.entries(value).filter(([k, v]) => k.endsWith('Enc') && typeof v === 'string');
    const results = {};
    for (const [field, enc] of encFields) {
      results[field] = tryDecrypt(enc);
    }
    console.log(
      JSON.stringify({
        key,
        webhookUrl: value.webhookUrl ?? null,
        integrationMode: value.integrationMode ?? null,
        host: value.host ?? null,
        decrypt: results,
      }),
    );
  }

  const webhooks = await prisma.webhookLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      source: true,
      signatureValid: true,
      paymentReference: true,
      processed: true,
      createdAt: true,
    },
  });
  console.log('WEBHOOKS', JSON.stringify(webhooks, null, 2));
}

main().finally(() => prisma.$disconnect());
