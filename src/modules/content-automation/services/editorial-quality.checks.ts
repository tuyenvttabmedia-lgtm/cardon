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
  if (/(ho tro|co the|duoc)\s*hoan tien|hoan tien khi|doi hoac hoan|ho tro doi/.test(policyBlob)) {
    inventedPolicy.push('hoàn tiền/đổi');
  }
  if (
    /(?<!khong\s)(ho tro|co the|duoc)\s*doi tra/.test(policyBlob) &&
    !/thuong khong.{0,24}doi tra|ma so thuong khong/.test(policyBlob)
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
          `Có thể bịa chính sách («${inventedPolicy.join(', ')}») — bỏ hoặc chỉ nêu nếu có trong fact`,
        )
      : passed('INVENTED_POLICY', 'Không thấy claim hoàn tiền/đổi trả/cấp phép/hạn dùng dễ bịa'),
  );

  // Soft: invented instant-delivery SLA
  const instantHits = collectFullText(doc).match(
    /ngay lập tức|tức thì|trong vài giây|nhận mã ngay|gửi ngay lập tức|tự động gửi mã thẻ ngay|thường hiện ngay/gi,
  );
  checks.push(
    instantHits && instantHits.length >= 2
      ? warn(
          'INVENTED_SLA',
          `Lặp claim giao mã tức thì («${instantHits[0]}») — tránh SLA bịa; nói mã hiện trên đơn/email sau thanh toán thành công`,
        )
      : passed('INVENTED_SLA', 'Không thấy SLA giao mã tức thì bị lặp'),
  );

  // Soft: empty generic advantages H2
  const genericAdv = doc.sections.some((s, i) => {
    if (s.type !== 'h2') return false;
    if (!/ưu điểm|lợi ích|tại sao nên/i.test(s.text ?? '')) return false;
    const next = doc.sections[i + 1];
    if (!next || (next.type !== 'ul' && next.type !== 'ol')) return false;
    const listNorm = normalizeText((next.items ?? []).join(' '));
    const fluff =
      (/nhanh|tien loi|an toan|pho bien|khong can/.test(listNorm) ? 1 : 0) +
      (/rui ro|mat the|hu hong|gia/.test(listNorm) ? 1 : 0) +
      (/de dang|luu tru|thiet bi/.test(listNorm) ? 1 : 0);
    return fluff >= 2 && !listNorm.includes('cardon');
  });
  checks.push(
    genericAdv
      ? warn(
          'GENERIC_ADVANTAGES',
          'H2 ưu điểm chỉ toàn nhanh/tiện/an toàn chung chung — gộp vào định nghĩa/how-to hoặc thêm tip CardOn cụ thể',
        )
      : passed('GENERIC_ADVANTAGES', 'Không thấy H2 ưu điểm filler thuần'),
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
      !/tong quan|gioi thieu|tong quat|la gi|cach thuc hoat dong/.test(h2Norm)
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
      /cardon|\*1\d|#|buoc \d|dang nhap|momo|my viettel|my mobifone|my vinaphone|chon the|menh gia/.test(
        blob,
      );
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
    /mua (ma )?the|mua the dien thoai|mua the game|nhan ma tu dong|scoin|zing|garena/.test(
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
        /cach mua|huong dan mua|mua tren cardon|mua ma the tren/.test(
          normalizeText(s.text ?? ''),
        ),
    );
    const hasBuyOl = doc.sections.some((s) => {
      if (s.type !== 'ol' || (s.items?.length ?? 0) < 4) return false;
      const blob = normalizeText((s.items ?? []).join(' '));
      return /chon|menh gia|thanh toan|cardon|don hang|ma the/.test(blob);
    });
    checks.push(
      hasBuyFlowH2 && hasBuyOl
        ? passed('MISSING_BUY_FLOW', 'Có H2 + ol bước mua trên CardOn')
        : warn(
            'MISSING_BUY_FLOW',
            'Bài mua mã thẻ thiếu H2 + ol bước mua trên CardOn — đưa luồng mua lên trước chính sách hoàn tiền',
          ),
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
