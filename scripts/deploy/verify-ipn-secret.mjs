import { createDecipheriv, createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function decrypt(enc) {
  const secret = process.env.ENCRYPTION_KEY;
  const key = createHash('sha256').update(secret).digest();
  const [ivB64, tagB64, dataB64] = enc.split(':');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

async function main() {
  const row = await prisma.systemSetting.findUnique({
    where: { key: 'settings.payment.sepay' },
  });
  const stored = row?.value ?? {};
  const ipn = stored.webhookSecretEnc ? decrypt(stored.webhookSecretEnc) : null;
  const expected = process.env.EXPECTED_IPN ?? 'hEfSSJmwb2y9!gm';
  console.log(
    JSON.stringify({
      ipnLength: ipn?.length ?? 0,
      ipnLast3: ipn ? ipn.slice(-3) : null,
      expectedLast3: expected.slice(-3),
      matchesExpected: ipn === expected,
      webhookUrl: stored.webhookUrl ?? null,
    }),
  );
}

main().finally(() => prisma.$disconnect());
