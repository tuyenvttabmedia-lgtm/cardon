import type { ContentPlan } from '@prisma/client';
import type { ArticleBlock, ArticleDocumentV1 } from '../entities/article-document.types';
import type { QualityCheckItem } from '../entities/quality-report.types';
import type { GenerationContext } from '../entities/generation-context.types';

const FILLER_PHRASES = [
  'tiện lợi và phổ biến',
  'nhanh chóng, tiện lợi và an toàn',
  'nhanh chóng tiện lợi và an toàn',
  'mang lại nhiều lợi ích',
  'gây lo lắng',
  'xu hướng hiện nay',
  'ngày càng được ưa chuộng',
  'ưu nhược điểm riêng',
  'linh hoạt trong việc',
];

const CTA_H2_RE =
  /(so sánh.*thẻ|mua thẻ|nạp thẻ|cardon\.vn|các loại thẻ|thẻ garena|thẻ game)/i;

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(
    normalizeText(s)
      .split(' ')
      .filter((t) => t.length >= 3),
  );
}

/** Jaccard similarity on tokens (0–1). */
export function textSimilarity(a: string, b: string): number {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

function wordCountOf(doc: ArticleDocumentV1): { body: number; faq: number } {
  let body = 0;
  let faq = 0;
  for (const s of doc.sections) {
    const texts = [s.text ?? '', ...(s.items ?? [])];
    if (s.type === 'faq' && s.faqItems) {
      for (const f of s.faqItems) {
        faq += `${f.question} ${f.answer}`.split(/\s+/).filter(Boolean).length;
      }
    } else {
      body += texts.join(' ').split(/\s+/).filter(Boolean).length;
    }
  }
  return { body, faq };
}

function collectFullText(doc: ArticleDocumentV1): string {
  return doc.sections
    .flatMap((s) => {
      const parts = [s.text ?? '', ...(s.items ?? [])];
      if (s.faqItems) {
        for (const f of s.faqItems) parts.push(f.question, f.answer);
      }
      return parts;
    })
    .join(' ');
}

/** Count paragraph → ul/ol pairs with high token overlap (article-wide). */
export function countParaListDupPairs(
  sections: ArticleBlock[],
  threshold = 0.5,
): number {
  let count = 0;
  for (let i = 0; i < sections.length - 1; i++) {
    const cur = sections[i];
    const next = sections[i + 1];
    if (cur.type !== 'paragraph' || !cur.text) continue;
    if (next.type !== 'ul' && next.type !== 'ol') continue;
    const listText = (next.items ?? []).join(' ');
    if (!listText) continue;
    if (textSimilarity(cur.text, listText) >= threshold) count += 1;
  }
  return count;
}

function topicTokens(plan: ContentPlan): Set<string> {
  return tokenSet(`${plan.topic} ${plan.primaryKeyword}`);
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / Math.min(a.size, b.size);
}

/**
 * Soft Layer-3 editorial diagnostics (warnings do not fail the gate).
 */
export function runEditorialSoftChecks(
  plan: ContentPlan,
  doc: ArticleDocumentV1,
  context: GenerationContext,
): QualityCheckItem[] {
  const checks: QualityCheckItem[] = [];

  // DUP_OPENING: paragraph paraphrased as list immediately after (count all pairs)
  const dupPairs = countParaListDupPairs(doc.sections);
  checks.push(
    dupPairs > 0
      ? warn(
          'DUP_OPENING',
          dupPairs === 1
            ? 'Có 1 cặp đoạn→list paraphrase nhau — giữ một dạng thôi'
            : `Có ${dupPairs} cặp đoạn→list paraphrase nhau — bài tip đang bị nhân đôi nội dung`,
        )
      : passed('DUP_OPENING', 'Không phát hiện paragraph trùng list ngay sau'),
  );

  // FAQ_OVERWEIGHT
  const counts = wordCountOf(doc);
  const faqItems = doc.sections
    .filter((s) => s.type === 'faq')
    .flatMap((s) => s.faqItems ?? []);
  const faqTooMany = faqItems.length > 3;
  const faqHeavy =
    counts.faq > 0 && counts.body > 0 && counts.faq / (counts.body + counts.faq) > 0.35;
  checks.push(
    faqTooMany || faqHeavy
      ? warn(
          'FAQ_OVERWEIGHT',
          faqTooMany
            ? `FAQ có ${faqItems.length} câu (>3)`
            : `FAQ chiếm ~${Math.round((counts.faq / (counts.body + counts.faq)) * 100)}% bài (nên <35%)`,
        )
      : passed('FAQ_OVERWEIGHT', 'Tỷ lệ FAQ ổn'),
  );

  // OFF_TOPIC_CTA: product/CTA H2 too early on non-product types
  const productTypes = new Set(['PRODUCT', 'COMPARISON', 'PROMOTION']);
  if (!productTypes.has(plan.contentType)) {
    const h2Indexes = doc.sections
      .map((s, idx) => ({ s, idx }))
      .filter(({ s }) => s.type === 'h2' && CTA_H2_RE.test(s.text ?? ''));
    const early = h2Indexes.filter(({ idx }) => idx < Math.ceil(doc.sections.length * 0.45));
    const topicLooksProduct = CTA_H2_RE.test(`${plan.topic} ${plan.primaryKeyword}`);
    checks.push(
      early.length > 0 && !topicLooksProduct
        ? warn(
            'OFF_TOPIC_CTA',
            `H2 CTA/sản phẩm xuất hiện sớm (vd. «${early[0]?.s.text}») — ưu tiên trả lời chủ đề trước`,
          )
        : passed('OFF_TOPIC_CTA', 'Không thấy H2 CTA/sản phẩm lệch đề sớm'),
    );
  }

  // FILLER_PHRASES
  const full = normalizeText(collectFullText(doc));
  const hit = FILLER_PHRASES.filter((p) => full.includes(normalizeText(p)));
  checks.push(
    hit.length > 0
      ? warn('FILLER_PHRASES', `Phát hiện cụm sáo: ${hit.slice(0, 3).join('; ')}`)
      : passed('FILLER_PHRASES', 'Không thấy cụm filler phổ biến'),
  );

  // WEAK_INTERNAL_LINK vs plan topic
  const planTok = topicTokens(plan);
  const weakLinks: string[] = [];
  for (const link of doc.internalLinks) {
    const page = context.existingContent.find((c) => c.pageId === link.targetPageId);
    const label = `${link.anchorText} ${page?.title ?? ''} ${page?.focusKeyword ?? ''}`;
    const ratio = overlapRatio(planTok, tokenSet(label));
    if (ratio < 0.15) {
      weakLinks.push(page?.title || link.anchorText || link.targetPageId);
    }
  }
  if (doc.internalLinks.length === 0) {
    checks.push(info('WEAK_INTERNAL_LINK', 'Không có internal link (ổn nếu không có bài cùng chủ đề)'));
  } else {
    checks.push(
      weakLinks.length > 0
        ? warn(
            'WEAK_INTERNAL_LINK',
            `Link có vẻ lệch chủ đề: ${weakLinks.slice(0, 2).join('; ')}`,
          )
        : passed('WEAK_INTERNAL_LINK', 'Internal link khớp chủ đề ở mức cơ bản'),
    );
  }

  // Topics about top-up / history should mention CardOn order/history check
  const topicBlob = normalizeText(`${plan.topic} ${plan.primaryKeyword}`);
  const topupTopic =
    /lich su nap|nap tien|the dien thoai|top ?up|nap the|ma qr|quet ma qr/.test(topicBlob) &&
    !/garena|zing|vcoin|game/.test(topicBlob);
  if (topupTopic) {
    const bodyNorm = normalizeText(collectFullText(doc));
    const hasCardonHistory =
      bodyNorm.includes('cardon') &&
      (/lich su|don hang|trang thai|giao dich/.test(bodyNorm) || bodyNorm.includes('cardon'));
    checks.push(
      hasCardonHistory
        ? passed('CARDON_TOPUP_SECTION', 'Có nhắc kiểm tra/giao dịch trên CardOn')
        : warn(
            'CARDON_TOPUP_SECTION',
            'Topic nạp tiền/lịch sử nạp nhưng thiếu mục kiểm tra trên CardOn',
          ),
    );
  }

  // Thin teaser: opening too long for GUIDE-like intros
  const firstPara = doc.sections.find((s) => s.type === 'paragraph' && s.text);
  if (firstPara?.text) {
    const sentences = firstPara.text.split(/[.!?…]+/).filter((s) => s.trim().length > 12);
    checks.push(
      sentences.length > 3
        ? warn('INTRO_TOO_LONG', `Đoạn mở ~${sentences.length} câu (nên ≤3)`)
        : passed('INTRO_TOO_LONG', 'Độ dài đoạn mở ổn'),
    );
  }

  // Invented retention / policy durations in FAQ or body (soft)
  const durationHits = collectFullText(doc).match(
    /\b\d+\s*(tháng|năm|ngày|giờ)\b.*(lưu|lịch sử|bảo quản|lưu trữ)|lưu trữ.{0,40}\d+\s*(tháng|năm)/gi,
  );
  checks.push(
    durationHits && durationHits.length > 0
      ? warn(
          'INVENTED_DURATION',
          `Có thể bịa thời hạn chính sách: «${durationHits[0].slice(0, 80)}…» — chỉ nêu nếu có trong fact`,
        )
      : passed('INVENTED_DURATION', 'Không thấy thời hạn chính sách kiểu số tháng bịa'),
  );

  // Soft: refund / licensing claims often invented for digital cards
  const policyBlob = normalizeText(collectFullText(doc));
  const inventedPolicy: string[] = [];
  if (/hoan tien|hoan lai|refund/.test(policyBlob)) inventedPolicy.push('hoàn tiền');
  if (/duoc cap phep|giay phep kinh doanh/.test(policyBlob)) inventedPolicy.push('cấp phép');
  if (/han su dung.*(the|ma)|the.{0,20}han su dung/.test(policyBlob)) {
    inventedPolicy.push('hạn sử dụng thẻ');
  }
  checks.push(
    inventedPolicy.length > 0
      ? warn(
          'INVENTED_POLICY',
          `Có thể bịa chính sách («${inventedPolicy.join(', ')}») — bỏ hoặc chỉ nêu nếu có trong fact`,
        )
      : passed('INVENTED_POLICY', 'Không thấy claim hoàn tiền/cấp phép/hạn dùng dễ bịa'),
  );

  return checks;
}

function passed(code: string, message: string): QualityCheckItem {
  return { code, layer: 3, severity: 'info', message, passed: true };
}

function warn(code: string, message: string): QualityCheckItem {
  return { code, layer: 3, severity: 'warning', message, passed: true };
}

function info(code: string, message: string): QualityCheckItem {
  return { code, layer: 3, severity: 'info', message, passed: true };
}
