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

function findDupOpening(sections: ArticleBlock[]): boolean {
  for (let i = 0; i < sections.length - 1; i++) {
    const cur = sections[i];
    const next = sections[i + 1];
    if (cur.type !== 'paragraph' || !cur.text) continue;
    if (next.type !== 'ul' && next.type !== 'ol') continue;
    const listText = (next.items ?? []).join(' ');
    if (!listText) continue;
    if (textSimilarity(cur.text, listText) >= 0.55) return true;
  }
  return false;
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

  // DUP_OPENING: paragraph paraphrased as list immediately after
  checks.push(
    findDupOpening(doc.sections)
      ? warn('DUP_OPENING', 'Đoạn mở bị lặp lại gần như nguyên văn bằng list ngay bên dưới')
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
