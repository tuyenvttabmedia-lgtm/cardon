/**
 * Replace fake marketing counters on CMS page `gioi-thieu` with BCT-safe trust pillars.
 *
 * Usage (API container):
 *   node /app/scripts/deploy/patch-gioi-thieu-trust-block.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FAKE_STATS_RE =
  /<div class="cms-block-stats">[\s\S]*?<p class="cms-block-stat-value">50K\+<\/p>[\s\S]*?<\/div>\s*<\/div>/i;

const TRUST_BLOCK = `<div class="cms-block-stats">
  <div class="cms-block-stat">
    <p class="cms-block-stat-value">Giao mã</p>
    <p class="cms-block-stat-label">Tự động sau thanh toán</p>
  </div>
  <div class="cms-block-stat">
    <p class="cms-block-stat-value">Thanh toán</p>
    <p class="cms-block-stat-label">QR / chuyển khoản ngân hàng</p>
  </div>
  <div class="cms-block-stat">
    <p class="cms-block-stat-value">Minh bạch</p>
    <p class="cms-block-stat-label">Thông tin doanh nghiệp công khai</p>
  </div>
  <div class="cms-block-stat">
    <p class="cms-block-stat-value">Hỗ trợ</p>
    <p class="cms-block-stat-label">Email · Hotline · Zalo</p>
  </div>
</div>`;

const COMPANY_SECTION = `<div class="cms-block-section">
  <h2>Thông tin doanh nghiệp</h2>
  <p>Tên công ty, mã số thuế, địa chỉ trụ sở, email và thời gian làm việc được công bố tại chân trang website và trang Liên hệ — đúng thông tin đã đăng ký kinh doanh.</p>
</div>`;

async function main() {
  const page = await prisma.cmsPage.findFirst({ where: { slug: 'gioi-thieu' } });
  if (!page) {
    console.log('[patch-gioi-thieu] no cms page slug=gioi-thieu — skip');
    return;
  }

  let content = page.content ?? '';
  let changed = false;

  if (FAKE_STATS_RE.test(content)) {
    content = content.replace(FAKE_STATS_RE, TRUST_BLOCK);
    changed = true;
    console.log('[patch-gioi-thieu] replaced fake stats block');
  } else if (content.includes('50K+') || content.includes('200K+')) {
    // Looser fallback: strip any stats block that still contains marketing counters
    content = content.replace(
      /<div class="cms-block-stats">[\s\S]*?<\/div>\s*<\/div>/i,
      TRUST_BLOCK,
    );
    changed = true;
    console.log('[patch-gioi-thieu] replaced stats block via fallback');
  } else if (!content.includes('Thông tin doanh nghiệp công khai') && !content.includes('cms-block-stats')) {
    console.log('[patch-gioi-thieu] no fake stats found — content already clean or custom');
  }

  if (changed && !content.includes('Thông tin doanh nghiệp')) {
    // Insert company section before "Vì sao chọn" if present
    if (content.includes('<h2>Vì sao chọn CardOn?</h2>')) {
      content = content.replace(
        '<h2>Vì sao chọn CardOn?</h2>',
        `${COMPANY_SECTION}\n<h2>Vì sao chọn CardOn?</h2>`,
      );
    } else {
      content = `${content}\n${COMPANY_SECTION}`;
    }
    console.log('[patch-gioi-thieu] inserted company transparency section');
  }

  // Soften common hyperbolic phrases when present
  const beforeSoft = content;
  content = content
    .replace(/nạp cước hàng đầu\./g, 'nạp cước tin cậy, dễ tiếp cận.')
    .replace(/Giá tốt nhất/g, 'Giá rõ ràng')
    .replace(
      /Chiết khấu hấp dẫn, không phí ẩn, minh bạch từng giao dịch\./g,
      'Chiết khấu hiển thị trước khi thanh toán, không phí ẩn.',
    );
  if (content !== beforeSoft) {
    changed = true;
    console.log('[patch-gioi-thieu] softened marketing copy');
  }

  if (!changed) {
    console.log('[patch-gioi-thieu] no content changes needed');
    return;
  }

  await prisma.cmsPage.update({
    where: { id: page.id },
    data: { content },
  });
  console.log('[patch-gioi-thieu] saved slug=gioi-thieu id=', page.id);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
