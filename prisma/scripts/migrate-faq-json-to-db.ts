/**
 * One-shot migration: JSON FAQ (system_settings) → PostgreSQL faqs tables.
 *
 * Usage (after prisma migrate):
 *   npx ts-node prisma/scripts/migrate-faq-json-to-db.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'cms.faq.items' } });
  const raw = row?.value;
  if (!Array.isArray(raw) || raw.length === 0) {
    console.log('No legacy FAQ JSON found — nothing to migrate.');
    return;
  }

  const defaultCategory = await prisma.faqCategory.findUnique({ where: { slug: 'chung' } });
  if (!defaultCategory) {
    throw new Error('Default category "chung" not found. Run prisma migration first.');
  }

  const items = raw.filter(
    (i: { question?: string; answer?: string }) => i?.question?.trim() && i?.answer?.trim(),
  );

  const homepageCandidates = items
    .filter((i: { category?: string }) => i.category === 'homepage' || i.category === 'general')
    .sort((a: { sortOrder?: number }, b: { sortOrder?: number }) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const featuredIds = new Set(homepageCandidates.slice(0, 10).map((i: { id: string }) => i.id));

  function slugify(input: string) {
    return input
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  function wrapPlain(text: string) {
    if (/<[a-z][\s\S]*>/i.test(text)) return text;
    return `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`;
  }

  const usedSlugs = new Set<string>();
  let migrated = 0;
  let skipped = 0;

  for (const item of items.sort(
    (a: { sortOrder?: number }, b: { sortOrder?: number }) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  )) {
    const existing = await prisma.faq.findUnique({ where: { id: item.id } });
    if (existing) {
      skipped += 1;
      continue;
    }

    let slug = slugify(item.question) || `faq-${String(item.id).slice(0, 8)}`;
    let candidate = slug;
    let n = 2;
    while (usedSlugs.has(candidate) || (await prisma.faq.findUnique({ where: { slug: candidate } }))) {
      candidate = `${slug}-${n++}`;
    }
    usedSlugs.add(candidate);

    const positions: string[] = [];
    if (item.category === 'guide') positions.push('guide');
    if (item.category === 'contact') positions.push('contact');

    await prisma.faq.create({
      data: {
        id: item.id,
        categoryId: defaultCategory.id,
        question: item.question.trim(),
        answer: wrapPlain(item.answer.trim()),
        slug: candidate,
        featured: featuredIds.has(item.id),
        sortOrder: item.sortOrder ?? 0,
        status: item.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        positions: { create: positions.map((position) => ({ position })) },
      },
    });
    migrated += 1;
  }

  console.log(JSON.stringify({ migrated, skipped, featured: featuredIds.size, total: items.length }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
