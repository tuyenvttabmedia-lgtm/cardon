/**
 * Reduce B2C sell discount by 0.5pp to partially offset absorbed MegaPay fees.
 *
 * - CK ≈ 1%  → 0.5%  (sell = round(face × 0.995))
 * - CK ≈ 2%  → 1.5%  (sell = round(face × 0.985))
 * - CK ≈ 0% or other → unchanged
 *
 * Usage:
 *   docker exec -w /app cardon-prod-api node /app/scripts/deploy/adjust-retail-sell-discount-absorb-fee.mjs --dry-run
 *   docker exec -w /app cardon-prod-api node /app/scripts/deploy/adjust-retail-sell-discount-absorb-fee.mjs
 */
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');
const TOLERANCE_PP = 0.12;

function discountPercent(face: number, sell: number): number {
  if (face <= 0) return 0;
  return ((face - sell) / face) * 100;
}

function near(actual: number, target: number): boolean {
  return Math.abs(actual - target) <= TOLERANCE_PP;
}

function targetSell(face: number, fromCk: 1 | 2): number {
  const rate = fromCk === 1 ? 0.005 : 0.015;
  return Math.round(face * (1 - rate));
}

async function main() {
  const variants = await prisma.productVariant.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      sku: true,
      faceValue: true,
      sellPrice: true,
      status: true,
      product: { select: { slug: true, name: true } },
    },
    orderBy: [{ product: { slug: 'asc' } }, { faceValue: 'asc' }],
  });

  const updates = [];
  let skippedZero = 0;
  let skippedOther = 0;

  for (const v of variants) {
    const face = Number(v.faceValue);
    const sell = Number(v.sellPrice);
    const ck = discountPercent(face, sell);

    if (ck <= TOLERANCE_PP) {
      skippedZero += 1;
      continue;
    }

    let fromCk = null;
    if (near(ck, 1)) fromCk = 1;
    else if (near(ck, 2)) fromCk = 2;

    if (!fromCk) {
      skippedOther += 1;
      continue;
    }

    const nextSell = targetSell(face, fromCk);
    if (nextSell === Math.round(sell)) continue;

    updates.push({
      id: v.id,
      sku: v.sku,
      product: v.product.slug,
      face,
      fromCk,
      oldSell: Math.round(sell),
      newSell: nextSell,
      oldCk: Number(ck.toFixed(4)),
      newCk: fromCk === 1 ? 0.5 : 1.5,
    });
  }

  console.log(
    JSON.stringify(
      {
        dryRun: DRY_RUN,
        scanned: variants.length,
        toUpdate: updates.length,
        skippedZeroCk: skippedZero,
        skippedOtherCk: skippedOther,
        sample: updates.slice(0, 15),
      },
      null,
      2,
    ),
  );

  if (DRY_RUN || updates.length === 0) {
    return;
  }

  let done = 0;
  for (const row of updates) {
    await prisma.productVariant.update({
      where: { id: row.id },
      data: { sellPrice: new Decimal(row.newSell) },
    });
    done += 1;
  }
  console.log(`Updated ${done} variants.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
