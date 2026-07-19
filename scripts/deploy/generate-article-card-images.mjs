/**
 * Backfill /uploads/{folder}/cards/*.webp (640px) from existing originals.
 * Run on VPS: docker exec cardon-prod-api node /app/scripts/deploy/generate-article-card-images.mjs
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import sharp from 'sharp';

const UPLOAD_ROOT = process.env.MEDIA_UPLOAD_ROOT ?? '/app/uploads';
const FOLDERS = ['articles'];

async function ensureCard(folder, filename) {
  const ext = extname(filename).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return { skipped: true };

  const srcPath = join(UPLOAD_ROOT, folder, filename);
  const cardsDir = join(UPLOAD_ROOT, folder, 'cards');
  const cardName = filename.replace(/\.[^.]+$/, '.webp');
  const cardPath = join(cardsDir, cardName);

  if (existsSync(cardPath)) return { skipped: true };

  mkdirSync(cardsDir, { recursive: true });
  await sharp(srcPath, { failOn: 'none' })
    .resize(640, 360, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(cardPath);

  return { created: true, cardPath };
}

async function main() {
  let created = 0;
  let skipped = 0;

  for (const folder of FOLDERS) {
    const dir = join(UPLOAD_ROOT, folder);
    if (!existsSync(dir)) continue;

    for (const filename of readdirSync(dir)) {
      if (filename === 'thumbs' || filename === 'cards') continue;
      const result = await ensureCard(folder, filename);
      if (result.created) created += 1;
      else skipped += 1;
    }
  }

  console.log(`CARD_IMAGES_DONE created=${created} skipped=${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
