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
  'gây khó chịu',
  'mất tiền oan',
  'xu hướng hiện nay',
  'ngày càng được ưa chuộng',
  'ưu nhược điểm riêng',
  'linh hoạt trong việc',
  'gây ra nhiều phiền toái',
  'thiệt hại không đáng có',
];

const CTA_H2_RE =
  /(so sánh.*thẻ|mua thẻ|nạp thẻ|cardon\.vn|các loại thẻ|thẻ garena|thẻ game)/i;

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
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

  // Invented retention / policy durations / carrier lock windows (soft)
  const fullText = collectFullText(doc);
  const durationHits = fullText.match(
    /\b\d+\s*(tháng|năm|ngày|giờ)\b.{0,40}(lưu|lịch sử|bảo quản|lưu trữ|khóa|thu hồi|không sử dụng|không phát sinh)|(?:khóa|thu hồi|không sử dụng).{0,40}\b\d+\s*(tháng|năm|ngày)/gi,
  );
  checks.push(
    durationHits && durationHits.length > 0
      ? warn(
          'INVENTED_DURATION',
          `Có thể bịa thời hạn/chính sách («${durationHits[0].slice(0, 80)}») — chỉ nêu nếu có trong fact; với SIM hãy bảo xem app/tổng đài`,
        )
      : passed('INVENTED_DURATION', 'Không thấy thời hạn chính sách kiểu số ngày/tháng bịa'),
  );

  // Soft: refund / licensing / exchange / expiry — only POSITIVE invented promises
  // Saying "thường không đổi trả" is OK and should not warn.
  const policyBlob = normalizeText(collectFullText(doc));
  const inventedPolicy: string[] = [];
  if (
    /(ho tro|co the|duoc)\s*hoan tien|hoan tien khi|doi hoac hoan|ho tro doi( the| tra)?|co the (ho tro )?doi the|ho tro doi the/.test(
      policyBlob,
    )
  ) {
    inventedPolicy.push('hoàn tiền/đổi');
  }
  if (
    /(?<!khong\s)(ho tro|co the|duoc)\s*doi tra/.test(policyBlob) &&
    !/thuong khong.{0,24}doi tra|ma so thuong khong|khong nen ky vong/.test(policyBlob)
  ) {
    inventedPolicy.push('đổi trả');
  }
  if (/duoc cap phep|giay phep kinh doanh/.test(policyBlob)) inventedPolicy.push('cấp phép');
  if (/han su dung.*(the|ma)|the.{0,20}han su dung/.test(policyBlob)) {
    inventedPolicy.push('hạn sử dụng thẻ');
  }
  checks.push(
    inventedPolicy.length > 0
      ? warn(
          'INVENTED_POLICY',
          `Có thể bịa chính sách («${inventedPolicy.join(', ')}») — bỏ soft-hứa đổi/hoàn; chỉ «liên hệ hỗ trợ kèm mã đơn để xem xét»`,
        )
      : passed('INVENTED_POLICY', 'Không thấy claim hoàn tiền/đổi trả/cấp phép/hạn dùng dễ bịa'),
  );

  // Soft: invented instant-delivery SLA
  const instantHits = collectFullText(doc).match(
    /ngay lập tức|tức thì|trong vài giây|nhận mã ngay|gửi ngay lập tức|tự động gửi mã thẻ ngay|thường hiện ngay|nhận mã thẻ nhanh chóng|giao mã tự động|giao mã.{0,12}nhanh/gi,
  );
  checks.push(
    instantHits && instantHits.length >= 2
      ? warn(
          'INVENTED_SLA',
          `Lặp claim giao mã tức thì («${instantHits[0]}») — tránh SLA bịa; nói mã hiện trên đơn/email sau thanh toán thành công`,
        )
      : passed('INVENTED_SLA', 'Không thấy SLA giao mã tức thì bị lặp'),
  );

  // Soft: invented phone-card digit lengths (unless from facts — gate is soft warn)
  const inventedCardDigits =
    /(viettel|mobifone|vinaphone|ma the).{0,40}\d{1,2}\s*(hoac|den|-|–)?\s*\d{0,2}\s*so|\d{1,2}\s*(hoac|den)\s*\d{1,2}\s*so/.test(
      policyBlob,
    );
  checks.push(
    inventedCardDigits
      ? warn(
          'INVENTED_CARD_DIGITS',
          'Có vẻ bịa độ dài mã thẻ (vd. 13/15 số) — bỏ số cụ thể; bảo nhập đúng mã theo nhà mạng trên app/USSD',
        )
      : passed('INVENTED_CARD_DIGITS', 'Không thấy claim độ dài mã thẻ bịa'),
  );

  // Soft: invented unlimited purchase quantity
  const inventedQty =
    /khong gioi han so luong|khong bi gioi han so luong|hau het.{0,40}khong gioi han/.test(
      policyBlob,
    );
  checks.push(
    inventedQty
      ? warn(
          'INVENTED_QUANTITY_CLAIM',
          'Claim không giới hạn số lượng — bỏ; bảo chọn số lượng trên trang sản phẩm / theo thông báo hệ thống',
        )
      : passed('INVENTED_QUANTITY_CLAIM', 'Không thấy claim không giới hạn số lượng'),
  );

  // Soft: empty generic advantages H2
  const genericAdv = doc.sections.some((s, i) => {
    if (s.type !== 'h2') return false;
    if (!/ưu điểm|lợi ích|tại sao nên/i.test(s.text ?? '')) return false;
    const next = doc.sections[i + 1];
    if (!next || (next.type !== 'ul' && next.type !== 'ol')) return false;
    const listNorm = normalizeText((next.items ?? []).join(' '));
    const fluff =
      (/nhanh|tien loi|an toan|pho bien|khong can|chu dong|tiet kiem thoi gian/.test(listNorm)
        ? 1
        : 0) +
      (/rui ro|mat the|hu hong|gia|the gia|chinh hang/.test(listNorm) ? 1 : 0) +
      (/de dang|luu tru|thiet bi|than thien|linh hoat|da dang/.test(listNorm) ? 1 : 0);
    const hasConcreteHowTo = /buoc \d|chon (nha mang|menh gia)|so luong|dang nhap/.test(listNorm);
    return fluff >= 2 && !hasConcreteHowTo;
  });
  checks.push(
    genericAdv
      ? warn(
          'GENERIC_ADVANTAGES',
          'H2 ưu điểm/lợi ích/tại sao chỉ filler nhanh–tiện–chính hãng — gộp 1 mục ngắn hoặc bỏ, ưu tiên bước mua',
        )
      : passed('GENERIC_ADVANTAGES', 'Không thấy H2 ưu điểm filler thuần'),
  );

  // Soft: stacked marketing benefit H2s on buy guides
  const advantageH2Count = doc.sections.filter(
    (s) =>
      s.type === 'h2' &&
      /tai sao nen|loi ich|uu diem|bat dau ngay|mua ngay (hom nay|tai)/.test(
        normalizeText(s.text ?? ''),
      ),
  ).length;
  checks.push(
    advantageH2Count >= 2
      ? warn(
          'DUPLICATE_ADVANTAGE_H2',
          `Có ${advantageH2Count} H2 kiểu tại sao/lợi ích/bắt đầu ngay — giữ tối đa 1, bỏ phần lặp`,
        )
      : passed('DUPLICATE_ADVANTAGE_H2', 'Không chồng nhiều H2 marketing lợi ích'),
  );

  // Soft: closing CTA H2 that only restates buy flow
  const closingCta = doc.sections.some((s, i) => {
    if (s.type !== 'h2') return false;
    if (!/bat dau ngay|mua ngay|san sang mua|ket luan/.test(normalizeText(s.text ?? ''))) {
      return false;
    }
    // Near end of article (last 35% of blocks)
    if (i < doc.sections.length * 0.55) return false;
    const next = doc.sections[i + 1];
    if (!next || (next.type !== 'ul' && next.type !== 'ol' && next.type !== 'paragraph')) {
      return true;
    }
    const blob = normalizeText([next.text ?? '', ...(next.items ?? [])].join(' '));
    return /chon (the|nha mang)|thanh toan|nhan ma|truy cap cardon/.test(blob);
  });
  checks.push(
    closingCta
      ? warn(
          'CLOSING_CTA_REHASH',
          'H2 kết/CTA «bắt đầu ngay» chỉ lặp lại bước mua — bỏ H2, để CTA ngắn sau lưu ý nếu cần',
        )
      : passed('CLOSING_CTA_REHASH', 'Không thấy H2 CTA cuối bài lặp bước mua'),
  );

  // Soft: thin bolted secondary brand H2 (e.g. Zing) when topic is broader auto-code buy
  const thinBrandH2 = doc.sections.find(
    (s) => s.type === 'h2' && /zing|garena|vcoin|funcard/i.test(s.text ?? ''),
  );
  const brandInTopic = /zing|garena|vcoin|funcard/.test(topicBlob);
  if (
    /mua the game|nhan ma tu dong|ma tu dong/.test(topicBlob) &&
    !brandInTopic &&
    thinBrandH2
  ) {
    checks.push(
      warn(
        'THIN_BRAND_H2',
        `H2 thương hiệu phụ «${thinBrandH2.text}» có vẻ gắn SEO mỏng — bỏ hoặc viết sâu bước mua/check cụ thể`,
      ),
    );
  } else {
    checks.push(passed('THIN_BRAND_H2', 'Không thấy H2 thương hiệu phụ lệch đề rõ'));
  }

  // Soft: FAQ question restates an existing H2
  const h2Texts = doc.sections
    .filter((s) => s.type === 'h2' && s.text)
    .map((s) => s.text as string);
  const faqQuestions = doc.sections
    .filter((s) => s.type === 'faq')
    .flatMap((s) => (s.faqItems ?? []).map((f) => f.question));
  const isCheckOrderTopic = (s: string) => {
    const n = normalizeText(s);
    return /kiem tra|lich su don|xem ma|xem don/.test(n) && /cardon|don hang|ma the/.test(n);
  };
  const faqDupH2 = faqQuestions.find((q) =>
    h2Texts.some(
      (h) =>
        textSimilarity(q, h) >= 0.4 ||
        (isCheckOrderTopic(q) && isCheckOrderTopic(h)),
    ),
  );
  checks.push(
    faqDupH2
      ? warn(
          'FAQ_REPEATS_H2',
          `FAQ trùng H2 («${faqDupH2.slice(0, 60)}») — đổi sang edge case khác`,
        )
      : passed('FAQ_REPEATS_H2', 'FAQ không trùng tiêu đề H2'),
  );

  // Soft: separate payment H2 when buy steps already mention payment methods
  const paymentH2Idx = doc.sections.findIndex(
    (s) => s.type === 'h2' && /phương thức thanh toán|thanh toán an toàn/i.test(s.text ?? ''),
  );
  const buyStepsMentionPay = doc.sections.some((s, i) => {
    if (s.type !== 'h2') return false;
    if (!/bước|cách mua|quy trình|mua thẻ/i.test(s.text ?? '')) return false;
    const following = doc.sections.slice(i + 1, i + 4);
    const blob = normalizeText(
      following
        .flatMap((b) => [b.text ?? '', ...(b.items ?? [])])
        .join(' '),
    );
    return /momo|zalopay|chuyen khoan|vi dien tu|thanh toan/.test(blob);
  });
  checks.push(
    paymentH2Idx >= 0 && buyStepsMentionPay
      ? warn(
          'OVERLAPPING_PAYMENT',
          'H2 phương thức thanh toán trùng với bước mua đã liệt kê thanh toán — gộp lại một chỗ',
        )
      : passed('OVERLAPPING_PAYMENT', 'Không thấy H2 thanh toán chồng bước mua'),
  );

  // Soft: empty overview H2 before real content
  const emptyOverview = doc.sections.some((s, i) => {
    if (s.type !== 'h2') return false;
    const h2Norm = normalizeText(s.text ?? '');
    if (
      !/tong quan|gioi thieu|tong quat|la gi|cach thuc hoat dong|vai tro trong game|vai tro cua the/.test(h2Norm)
    ) {
      return false;
    }
    const next = doc.sections[i + 1];
    if (!next || (next.type !== 'ul' && next.type !== 'ol' && next.type !== 'paragraph')) {
      return true;
    }
    const blob = normalizeText(
      [next.text ?? '', ...(next.items ?? [])].join(' '),
    );
    // Thin if mostly definition fluff without concrete steps/codes/CardOn depth
    const hasDepth =
      /cardon|\*1\d|#|buoc \d|dang nhap|momo|my viettel|my mobifone|my vinaphone|chon the|so luong|thanh toan (qua|bang|momo)/.test(
        blob,
      );
    // "là gì" H2s almost always fluff unless they already contain a real how-to
    if (/la gi/.test(h2Norm) && !hasDepth) return true;
    return !hasDepth && blob.split(' ').filter(Boolean).length < 80;
  });
  checks.push(
    emptyOverview
      ? warn(
          'EMPTY_OVERVIEW_H2',
          'H2 Tổng quan/Giới thiệu/là gì mỏng — bỏ và đi thẳng vào bước mua hoặc nội dung chính',
        )
      : passed('EMPTY_OVERVIEW_H2', 'Không thấy H2 tổng quan trống'),
  );

  // Soft: buy-card GUIDE should lead with buy flow, not refund stack
  const buyGuideTopicBlob = normalizeText(
    `${plan.topic} ${plan.primaryKeyword} ${context.userProvided.angle ?? ''}`,
  );
  const isBuyCardGuide =
    (plan.contentType === 'GUIDE' || plan.contentType === 'EXPLAINER') &&
    /mua .{0,24}(ma )?the|mua the dien thoai|ma the dien thoai|mua the game|nhan ma tu dong|scoin|zing|garena|mua nhieu/.test(
      buyGuideTopicBlob,
    ) &&
    !/hoan tien|chinh sach hoan|refund/.test(buyGuideTopicBlob);

  if (isBuyCardGuide) {
    const refundH2Count = doc.sections.filter(
      (s) =>
        s.type === 'h2' &&
        /hoan tien|chinh sach hoan|yeu cau hoan|doi tra/.test(
          normalizeText(s.text ?? ''),
        ),
    ).length;
    checks.push(
      refundH2Count >= 2
        ? warn(
            'REFUND_HEAVY_GUIDE',
            `Bài mua mã thẻ có ${refundH2Count} H2 về hoàn tiền/đổi trả — gộp thành một mục ngắn, ưu tiên bước mua CardOn`,
          )
        : passed('REFUND_HEAVY_GUIDE', 'Không lạm dụng H2 hoàn tiền trên bài mua thẻ'),
    );

    const hasBuyFlowH2 = doc.sections.some(
      (s) =>
        s.type === 'h2' &&
        /cach mua|huong dan mua|cac buoc mua|mua tren cardon|mua ma the tren|mua nhieu|mua the dien thoai|mua the scoin|mua the (zing|garena)/.test(
          normalizeText(s.text ?? ''),
        ),
    );
    const hasBuyOl = doc.sections.some((s) => {
      if (s.type !== 'ol' || (s.items?.length ?? 0) < 4) return false;
      const blob = normalizeText((s.items ?? []).join(' '));
      return /chon|menh gia|thanh toan|cardon|don hang|ma the|so luong/.test(blob);
    });
    checks.push(
      hasBuyFlowH2 && hasBuyOl
        ? passed('MISSING_BUY_FLOW', 'Có H2 + ol bước mua trên CardOn')
        : warn(
            'MISSING_BUY_FLOW',
            'Bài mua mã thẻ thiếu H2 + ol bước mua trên CardOn — đưa luồng mua lên trước fluff so sánh/đặc điểm nhà mạng',
          ),
    );

    const isMultiBuy = /mua nhieu|so luong|nhieu ma the/.test(buyGuideTopicBlob);
    if (isMultiBuy) {
      const buyOlHasQty = doc.sections.some((s) => {
        if (s.type !== 'ol') return false;
        return /so luong|nhieu ma|chon so/.test(normalizeText((s.items ?? []).join(' ')));
      });
      checks.push(
        buyOlHasQty
          ? passed('MULTI_BUY_QTY_STEP', 'Bước mua có nhắc số lượng')
          : warn(
              'MULTI_BUY_QTY_STEP',
              'Topic mua nhiều mã thẻ nhưng ol mua thiếu bước chọn số lượng',
            ),
      );
    }

    // Thin per-carrier "Đặc điểm mã thẻ X" fluff (digit myths / generic tips)
    const thinCarrierSpecs = doc.sections.some((s, i) => {
      if (s.type !== 'h2') return false;
      if (!/dac diem ma the|ma the (viettel|mobifone|vinaphone)/.test(normalizeText(s.text ?? ''))) {
        return false;
      }
      const next = doc.sections[i + 1];
      if (!next || (next.type !== 'ul' && next.type !== 'ol' && next.type !== 'paragraph')) {
        return true;
      }
      const blob = normalizeText([next.text ?? '', ...(next.items ?? [])].join(' '));
      const hasDepth = /cardon|buoc|so luong|thanh toan|dang nhap/.test(blob);
      return !hasDepth;
    });
    checks.push(
      thinCarrierSpecs
        ? warn(
            'THIN_CARRIER_SPECS_H2',
            'H2 Đặc điểm mã thẻ theo nhà mạng mỏng/bịa — gộp 1 mục so sánh ngắn hoặc bỏ, ưu tiên bước mua CardOn',
          )
        : passed('THIN_CARRIER_SPECS_H2', 'Không thấy H2 đặc điểm nhà mạng filler'),
    );
  }

  // Soft: CardOn receive-code tip cluster repeated across many sections
  const cardonTipRe =
    /(lich su don|trang don).{0,40}(email|spam)|(email|spam).{0,40}(ho tro|lien he).{0,20}cardon|ma the.{0,30}(email|spam|lich su)/;
  let cardonTipSections = 0;
  for (let i = 0; i < doc.sections.length; i++) {
    const s = doc.sections[i];
    const chunk = normalizeText(
      [s.text ?? '', ...(s.items ?? []), ...(s.faqItems ?? []).flatMap((f) => [f.question, f.answer])].join(
        ' ',
      ),
    );
    if (chunk.includes('cardon') && cardonTipRe.test(chunk)) cardonTipSections += 1;
  }
  checks.push(
    cardonTipSections >= 3
      ? warn(
          'REPEATED_CARDON_TIPS',
          `Cụm tip CardOn (đơn/email/spam/hỗ trợ) lặp ở ${cardonTipSections} chỗ — giữ một mục thôi`,
        )
      : passed('REPEATED_CARDON_TIPS', 'Tip CardOn nhận mã không bị nhân đôi quá mức'),
  );

  // Soft: speculative per-carrier invented failure policies in troubleshooting
  const bodyNormForCause = normalizeText(collectFullText(doc));
  const inventedCarrierCause =
    /vinaphone.{0,48}(gioi han|so lan nap)|mobifone.{0,48}(chi loi|chi bi)|viettel.{0,48}(dang bao tri my viettel|bao tri my viettel)|gioi han so lan nap trong ngay/.test(
      bodyNormForCause,
    );
  checks.push(
    inventedCarrierCause
      ? warn(
          'INVENTED_CARRIER_CAUSE',
          'Có vẻ bịa nguyên nhân riêng theo nhà mạng (giới hạn lần nạp / bảo trì cụ thể) — dùng nhóm nguyên nhân chung + bảo kiểm tra app/tổng đài',
        )
      : passed('INVENTED_CARRIER_CAUSE', 'Không thấy nguyên nhân nhà mạng bịa kiểu cứng'),
  );

  // Soft: troubleshooting should use ol for fix steps (mirrors gate TS_OL_STEPS)
  if (plan.contentType === 'TROUBLESHOOTING') {
    const hasOl = doc.sections.some((s) => s.type === 'ol' && (s.items?.length ?? 0) >= 4);
    const hasSupportH2 = doc.sections.some(
      (s) => s.type === 'h2' && /hỗ trợ|tổng đài|khi nào cần/i.test(s.text ?? ''),
    );
    checks.push(
      hasOl
        ? passed('TS_FIX_OL', 'Troubleshooting có ol bước xử lý')
        : warn('TS_FIX_OL', 'Troubleshooting thiếu ol ≥4 bước xử lý — đừng dùng ul cho toàn bộ cách xử lý'),
    );
    checks.push(
      hasSupportH2
        ? passed('TS_SUPPORT_H2', 'Có H2 hỗ trợ/tổng đài')
        : warn('TS_SUPPORT_H2', 'Thiếu H2 khi nào cần hỗ trợ nhà mạng/CardOn'),
    );

    // FAQ that re-asks "không nhận mã" when fix ol already covers check-order + support
    let fixBlob = '';
    for (let i = 0; i < doc.sections.length; i++) {
      const s = doc.sections[i];
      if (s.type === 'h2' && /cach xu ly|xu ly tung buoc|khac phuc/.test(normalizeText(s.text ?? ''))) {
        fixBlob = normalizeText(
          doc.sections
            .slice(i + 1, i + 5)
            .flatMap((b) => [b.text ?? '', ...(b.items ?? [])])
            .join(' '),
        );
        break;
      }
    }
    const fixCoversNoCode =
      /(lich su|chi tiet|trang) don|email|spam/.test(fixBlob) &&
      /(lien he|ho tro)/.test(fixBlob);
    const faqNoCodeRestates = doc.sections
      .filter((s) => s.type === 'faq')
      .flatMap((s) => s.faqItems ?? [])
      .some((f) => {
        const q = normalizeText(f.question);
        return (
          fixCoversNoCode &&
          /khong nhan (duoc )?ma|ma the khong (nhan|ve|hien)/.test(q)
        );
      });
    checks.push(
      faqNoCodeRestates
        ? warn(
            'FAQ_RESTATES_FIX',
            'FAQ «không nhận mã» lặp lại ol xử lý/check-order — đổi sang edge case khác (mã lỗi nạp, gian lận, mua nhầm)',
          )
        : passed('FAQ_RESTATES_FIX', 'FAQ không lặp lại bước xử lý không nhận mã'),
    );
  }

  // Soft: vague wait-window SLA
  const inventedWait =
    /thoi gian cho hop ly|sau (mot )?thoi gian cho|cho (vai|mot vai) (phut|gio)|sau nhieu gio|sau \d+\s*(gio|phut)/.test(
      policyBlob,
    );
  checks.push(
    inventedWait
      ? warn(
          'INVENTED_WAIT_WINDOW',
          'Claim «thời gian chờ hợp lý»/«sau nhiều giờ» — bỏ; bảo kiểm tra đơn/email rồi liên hệ hỗ trợ nếu chưa thấy mã',
        )
      : passed('INVENTED_WAIT_WINDOW', 'Không thấy cửa sổ chờ SLA bịa'),
  );

  // Soft: fraud / card-buy-error / hung-tx topics linking to delivery-SLA or brand-promo pages
  const isCardErrorTsTopic =
    /giao dich.{0,24}(bat thuong|bi treo|treo)|don treo|treo (don|giao dich)|gian lan|giao dich la|tru tien khong|loi (khi )?mua the|mua the.{0,24}(sai sot|loi|bi treo)|the dien tu online|thanh toan.{0,24}khong nhan ma/.test(
      topicBlob,
    );
  if (isCardErrorTsTopic || plan.contentType === 'TROUBLESHOOTING') {
    const allAnchors = [
      ...doc.internalLinks.map((l) => l.anchorText ?? ''),
      ...doc.sections.filter((s) => s.type === 'internalLink').map((s) => s.anchorText ?? ''),
    ].map((a) => normalizeText(a));

    if (isCardErrorTsTopic) {
      const slaLink = allAnchors.find((a) =>
        /bao lau nhan|nhan ma sau bao|sla|giao ma trong/.test(a),
      );
      checks.push(
        slaLink
          ? warn(
              'DELIVERY_SLA_LINK',
              'Topic lỗi/gian lận/treo mua thẻ nhưng link bài «bao lâu nhận mã» — đổi sang không nhận mã / mua nhầm / lỗi nạp',
            )
          : passed('DELIVERY_SLA_LINK', 'Link nội bộ không lệch sang SLA giao mã'),
      );

      const promoBrand = allAnchors.find((a) =>
        /(garena|vcoin|zing|scoin).{0,40}(gia re|chinh hang|khong bi lua)|mua the.{0,24}(gia re|an toan khong)|the dien thoai.{0,24}nap game|nap game duoc khong/.test(
          a,
        ),
      );
      checks.push(
        promoBrand
          ? warn(
              'PROMO_BRAND_LINK',
              'Topic lỗi/treo mua thẻ nhưng link promo/an toàn hoặc «thẻ ĐT nạp game» lệch đề — đổi sang lỗi nạp / mua nhầm / không nhận mã',
            )
          : passed('PROMO_BRAND_LINK', 'Không thấy link promo brand lệch đề troubleshooting'),
      );
    }
  }

  // Soft: hung-tx topic leading causes with redeem/expiry (not payment hang)
  const isHungTxTopic = /bi treo|treo (don|giao dich)|don treo|giao dich.{0,16}treo/.test(
    topicBlob,
  );
  if (isHungTxTopic) {
    let causeBlob = '';
    for (let i = 0; i < doc.sections.length; i++) {
      const s = doc.sections[i];
      if (s.type === 'h2' && /nguyen nhan/.test(normalizeText(s.text ?? ''))) {
        causeBlob = normalizeText(
          doc.sections
            .slice(i + 1, i + 12)
            .flatMap((b) => [b.text ?? '', ...(b.items ?? [])])
            .join(' '),
        );
        break;
      }
    }
    const redeemLead =
      /(het han|da (duoc )?su dung|nhap sai khi nap)/.test(causeBlob) &&
      !/thanh toan|dong bo|dang xu ly|bao tri|nha cung cap/.test(causeBlob);
    checks.push(
      redeemLead
        ? warn(
            'HUNG_TX_WRONG_CAUSE',
            'Topic treo giao dịch nhưng nguyên nhân chỉ kiểu mã hết hạn/nhập sai nạp — ưu tiên thanh toán/đồng bộ/nhà cung cấp',
          )
        : passed('HUNG_TX_WRONG_CAUSE', 'Nguyên nhân treo không lệch sang lỗi nạp thuần'),
    );

    const promiseResend = /gui lai ma the|se gui (lai )?ma/.test(policyBlob);
    checks.push(
      promiseResend
        ? warn(
            'PROMISE_RESEND_CODE',
            'Hứa hỗ trợ «gửi lại mã thẻ» — chỉ nói kiểm tra/hỗ trợ theo trạng thái đơn',
          )
        : passed('PROMISE_RESEND_CODE', 'Không hứa gửi lại mã thẻ'),
    );
  }

  // Soft: advise reselling unused phone/game codes
  const resaleAdvice = /ban lai (the|ma)|sang nhuong ma the|ban ma the cho nguoi/.test(
    normalizeText(collectFullText(doc)),
  );
  checks.push(
    resaleAdvice
      ? warn(
          'GRAY_MARKET_RESALE',
          'Khuyên bán lại/sang nhượng mã thẻ — bỏ; hướng dẫn liên hệ nơi bán + dùng đúng nhà mạng nếu còn dùng được',
        )
      : passed('GRAY_MARKET_RESALE', 'Không khuyên bán lại mã thẻ'),
  );

  // Soft: wrong-denom / mua nhầm topics need ol fix steps even if GUIDE
  const isWrongCardTopic =
    /sai menh gia|mua nham|sai loai the|nham menh gia|doi the game sai/.test(topicBlob);
  if (isWrongCardTopic) {
    const hasFixOl = doc.sections.some(
      (s) => s.type === 'ol' && (s.items?.length ?? 0) >= 4,
    );
    checks.push(
      hasFixOl
        ? passed('WRONG_CARD_FIX_OL', 'Topic sai mệnh giá/mua nhầm có ol xử lý')
        : warn(
            'WRONG_CARD_FIX_OL',
            'Topic sai mệnh giá/mua nhầm thiếu ol ≥4 bước xử lý — đừng chỉ dùng ul',
          ),
    );

    const avoidUseWrong =
      /tranh su dung ma the sai|khong (nen )?dung ma the sai|tranh dung ma.{0,20}sai menh gia/.test(
        policyBlob,
      );
    checks.push(
      avoidUseWrong
        ? warn(
            'WRONG_DENOM_AVOID_USE',
            'Khuyên tránh dùng mã sai mệnh giá — nếu cùng game/publisher thì mã vẫn dùng đúng giá trị đã mua',
          )
        : passed('WRONG_DENOM_AVOID_USE', 'Không khuyên bỏ phí mã cùng loại game'),
    );
  }

  // Soft: Title Case spam on internal link anchors
  const anchors: string[] = [];
  for (const link of doc.internalLinks) {
    if (link.anchorText) anchors.push(link.anchorText);
  }
  for (const s of doc.sections) {
    if (s.type === 'internalLink' && s.anchorText) anchors.push(s.anchorText);
  }
  const titleCaseAnchor = anchors.find((a) => {
    const words = a
      .replace(/[?!.…]+$/g, '')
      .split(/\s+/)
      .filter((w) => w.length >= 2);
    if (words.length < 4) return false;
    const capped = words.filter((w) => /^[A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/.test(w));
    return capped.length / words.length >= 0.7;
  });
  checks.push(
    titleCaseAnchor
      ? warn(
          'TITLE_CASE_ANCHOR',
          `Anchor Title Case («${titleCaseAnchor.slice(0, 50)}») — dùng sentence case tiếng Việt`,
        )
      : passed('TITLE_CASE_ANCHOR', 'Anchor internal link không bị Title Case spam'),
  );

  // Soft: redeem/nạp H2 mixed with CardOn buy/receive tips
  const redeemMixedBuy = doc.sections.some((s, i) => {
    if (s.type !== 'h2') return false;
    if (!/cach nap|nap the|nap (scoin|zing|garena|vcoin)|nap vao game/.test(normalizeText(s.text ?? ''))) {
      return false;
    }
    const following = doc.sections.slice(i + 1, i + 4);
    const blob = normalizeText(
      following.flatMap((b) => [b.text ?? '', ...(b.items ?? [])]).join(' '),
    );
    return (
      /(trang don|lich su don|chi tiet don|email|spam)/.test(blob) &&
      /(ma the|ma scoin).{0,40}(hien|nhan|gui)/.test(blob)
    );
  });
  checks.push(
    redeemMixedBuy
      ? warn(
          'REDEEM_MIXED_BUY_TIP',
          'H2 nạp vào game lẫn tip nhận mã trên đơn/email CardOn — tách: mua/check-order vs nạp cổng game',
        )
      : passed('REDEEM_MIXED_BUY_TIP', 'H2 nạp không lẫn tip nhận mã đơn CardOn'),
  );

  // Soft: long game catalog without change-disclaimer (Scoin/Zing-style)
  const gameListNoDisclaimer = doc.sections.some((s, i) => {
    if (s.type !== 'h2') return false;
    if (!/danh sach.*game|game dung the|cac game (dung|ho tro|nap)|game pho bien/.test(normalizeText(s.text ?? ''))) {
      return false;
    }
    const next = doc.sections[i + 1];
    if (!next || (next.type !== 'ul' && next.type !== 'ol')) return false;
    const items = next.items ?? [];
    if (items.length < 4) return false;
    const blob = normalizeText([s.text ?? '', ...items].join(' '));
    return !/thay doi|kiem tra cong|chinh thuc|tuy thoi diem|co the khac/.test(blob);
  });
  checks.push(
    gameListNoDisclaimer
      ? warn(
          'GAME_LIST_NO_DISCLAIMER',
          'Danh sách game cứng ≥4 mục thiếu disclaimer «có thể thay đổi / kiểm tra cổng nạp chính thức»',
        )
      : passed('GAME_LIST_NO_DISCLAIMER', 'Không thấy catalog game cứng thiếu disclaimer'),
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
