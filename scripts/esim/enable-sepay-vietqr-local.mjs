/**
 * Localhost helper: enable SePay VIETQR for eSIM VN lane.
 * Does not disable MegaPay DEPOSIT_CODE (cards/topup).
 */
import { PrismaClient } from '@prisma/client';

const KEY = 'settings.payment.methods';
const prisma = new PrismaClient();

const row = await prisma.systemSetting.findUnique({ where: { key: KEY } });
if (!row || typeof row.value !== 'object' || row.value === null) {
  console.error('No settings.payment.methods row');
  process.exit(1);
}

const value = structuredClone(row.value);
const methods = Array.isArray(value.methods) ? value.methods : [];
let changed = 0;
for (const method of methods) {
  if (
    method &&
    typeof method === 'object' &&
    String(method.gatewayCode).toUpperCase() === 'SEPAY' &&
    String(method.methodCode).toUpperCase() === 'VIETQR' &&
    method.enabled !== true
  ) {
    method.enabled = true;
    changed += 1;
  }
}

if (changed === 0) {
  console.log(JSON.stringify({ ok: true, changed: 0, message: 'VIETQR already enabled or missing' }));
} else {
  await prisma.systemSetting.update({
    where: { key: KEY },
    data: { value },
  });
  console.log(JSON.stringify({ ok: true, changed, message: 'Enabled SePay VIETQR' }));
}

await prisma.$disconnect();
