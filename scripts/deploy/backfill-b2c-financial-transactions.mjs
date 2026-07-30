/**
 * Backfill B2C ledger rows left at PENDING before the settlement fix.
 *
 * PAID order            -> COMPLETED
 * FAILED/EXPIRED order  -> FAILED
 * WAITING_PAYMENT order -> untouched (still in its payment window)
 *
 * Agent rows (AGENT_ORDER) are never touched.
 *
 * Usage:
 *   node scripts/deploy/backfill-b2c-financial-transactions.mjs          # dry run
 *   node scripts/deploy/backfill-b2c-financial-transactions.mjs --apply  # write
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

const pending = await prisma.financialTransaction.findMany({
  where: {
    type: 'B2C_CHECKOUT',
    status: 'PENDING',
    deletedAt: null,
  },
  select: {
    id: true,
    transactionId: true,
    amount: true,
    createdAt: true,
    orders: {
      select: { orderCode: true, paymentStatus: true, fulfillmentStatus: true },
    },
  },
  orderBy: { createdAt: 'asc' },
});

const toComplete = [];
const toFail = [];
const skipped = [];

for (const row of pending) {
  const statuses = new Set(row.orders.map((order) => order.paymentStatus));

  if (row.orders.length === 0) {
    skipped.push({ ...row, reason: 'NO_ORDER' });
  } else if (statuses.has('PAID')) {
    toComplete.push(row);
  } else if (
    [...statuses].every((status) =>
      ['FAILED', 'EXPIRED', 'REFUNDED'].includes(status),
    )
  ) {
    toFail.push(row);
  } else {
    skipped.push({ ...row, reason: 'WAITING_PAYMENT' });
  }
}

const describe = (row) =>
  `${row.transactionId} amount=${row.amount} orders=${row.orders
    .map((order) => `${order.orderCode}:${order.paymentStatus}/${order.fulfillmentStatus}`)
    .join(',')}`;

console.log(`Pending B2C rows: ${pending.length}`);
console.log(`-> COMPLETED: ${toComplete.length}`);
toComplete.forEach((row) => console.log(`   ${describe(row)}`));
console.log(`-> FAILED: ${toFail.length}`);
toFail.forEach((row) => console.log(`   ${describe(row)}`));
console.log(`-> skipped: ${skipped.length}`);
skipped.forEach((row) => console.log(`   [${row.reason}] ${describe(row)}`));

if (!apply) {
  console.log('\nDry run. Re-run with --apply to write these changes.');
  await prisma.$disconnect();
  process.exit(0);
}

if (toComplete.length > 0) {
  const result = await prisma.financialTransaction.updateMany({
    where: { id: { in: toComplete.map((row) => row.id) }, status: 'PENDING' },
    data: { status: 'COMPLETED' },
  });
  console.log(`\nCOMPLETED updated: ${result.count}`);
}

if (toFail.length > 0) {
  const result = await prisma.financialTransaction.updateMany({
    where: { id: { in: toFail.map((row) => row.id) }, status: 'PENDING' },
    data: { status: 'FAILED' },
  });
  console.log(`FAILED updated: ${result.count}`);
}

const remaining = await prisma.financialTransaction.count({
  where: { type: 'B2C_CHECKOUT', status: 'PENDING', deletedAt: null },
});
console.log(`Remaining PENDING B2C rows: ${remaining}`);

await prisma.$disconnect();
