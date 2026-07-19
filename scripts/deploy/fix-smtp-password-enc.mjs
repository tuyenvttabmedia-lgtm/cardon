/**
 * Remove corrupted SMTP passwordEnc so admin can load and re-save password.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const KEY = 'settings.smtp';

async function main() {
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY } });
  if (!row?.value || typeof row.value !== 'object') {
    console.log(JSON.stringify({ status: 'no_smtp_row' }));
    return;
  }
  const value = { ...row.value };
  delete value.passwordEnc;
  await prisma.systemSetting.update({
    where: { key: KEY },
    data: { value },
  });
  console.log(JSON.stringify({ status: 'passwordEnc_removed', host: value.host ?? null }));
}

main().finally(() => prisma.$disconnect());
