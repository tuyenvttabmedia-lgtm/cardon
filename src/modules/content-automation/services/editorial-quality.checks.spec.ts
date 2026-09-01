import { ContentPlanContentType, ContentPlanSearchIntent } from '@prisma/client';
import type { ContentPlan } from '@prisma/client';
import type { ArticleDocumentV1 } from '../entities/article-document.types';
import type { GenerationContext } from '../entities/generation-context.types';
import {
  runEditorialSoftChecks,
  textSimilarity,
} from './editorial-quality.checks';

function basePlan(over: Partial<ContentPlan> = {}): ContentPlan {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    status: 'CONTENT_READY',
    action: 'CREATE',
    generationEpoch: 0,
    sourceType: 'MANUAL',
    sourceRefId: null,
    topic: 'Sim bị khóa 1 chiều',
    primaryKeyword: 'sim bị khóa 1 chiều',
    searchIntent: ContentPlanSearchIntent.INFORMATIONAL,
    contentType: ContentPlanContentType.TROUBLESHOOTING,
    audience: null,
    businessObjective: null,
    priority: 'MEDIUM',
    suggestedTitle: 'Sim bị khóa 1 chiều: nguyên nhân và cách mở',
    intelligenceSnapshot: null,
    outline: null,
    articleDocument: null,
    qualityReport: null,
    references: null,
    cmsPageId: null,
    targetPageId: null,
    createdById: '00000000-0000-0000-0000-000000000002',
    outlineApprovedAt: null,
    contentApprovedAt: null,
    publishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as ContentPlan;
}

function emptyContext(over?: Partial<GenerationContext>): GenerationContext {
  return {
    plan: basePlan(),
    userProvided: {
      topic: 'Sim bị khóa 1 chiều',
      primaryKeyword: 'sim bị khóa 1 chiều',
      searchIntent: 'INFORMATIONAL',
      contentType: 'TROUBLESHOOTING',
      audience: null,
      businessObjective: null,
      supportingKeywords: [],
      angle: null,
    },
    brandContext: { siteName: 'CardOn', companyName: 'CardOn' },
    factContext: { refs: [] },
    existingContent: [],
    internalLinkCandidates: [],
    ...over,
  } as GenerationContext;
}

describe('editorial-quality.checks', () => {
  it('detects duplicate paragraph + list opening', () => {
    const doc: ArticleDocumentV1 = {
      schemaVersion: '1.0',
      title: 'Sim khóa 1 chiều',
      seo: {
        metaTitle: 'x'.repeat(30),
        metaDescription: 'y'.repeat(130),
        focusKeyword: 'sim bị khóa 1 chiều',
      },
      sections: [
        {
          id: '1',
          type: 'paragraph',
          text: 'Sim bị khóa 1 chiều là trạng thái chỉ chặn một chiều liên lạc gọi đi hoặc gọi đến.',
        },
        {
          id: '2',
          type: 'ul',
          items: [
            'Sim bị khóa 1 chiều chỉ chặn một chiều liên lạc gọi đi hoặc gọi đến',
            'Người dùng vẫn gọi hoặc nhận tùy chiều bị khóa',
          ],
        },
      ],
      factRefs: [],
      internalLinks: [],
      qualityFlags: [],
    };
    const checks = runEditorialSoftChecks(basePlan(), doc, emptyContext());
    const dup = checks.find((c) => c.code === 'DUP_OPENING');
    expect(dup?.severity).toBe('warning');
    expect(dup?.message).toMatch(/1 cặp/);
  });

  it('counts multiple paragraph→list paraphrase pairs', () => {
    const doc: ArticleDocumentV1 = {
      schemaVersion: '1.0',
      title: 'Mua thẻ game',
      seo: {
        metaTitle: 'x'.repeat(30),
        metaDescription: 'y'.repeat(130),
        focusKeyword: 'mua thẻ game online',
      },
      sections: [
        {
          id: 'p1',
          type: 'paragraph',
          text: 'Chọn nhà cung cấp uy tín và kiểm tra mệnh giá thẻ phù hợp.',
        },
        {
          id: 'u1',
          type: 'ul',
          items: [
            'Chọn nhà cung cấp uy tín',
            'Kiểm tra mệnh giá thẻ phù hợp',
          ],
        },
        {
          id: 'p2',
          type: 'paragraph',
          text: 'Lưu biên lai giao dịch và mã thẻ để đối chiếu khi cần.',
        },
        {
          id: 'u2',
          type: 'ul',
          items: [
            'Lưu biên lai giao dịch',
            'Giữ mã thẻ để đối chiếu khi cần',
          ],
        },
      ],
      factRefs: [],
      internalLinks: [],
      qualityFlags: [],
    };
    const checks = runEditorialSoftChecks(
      basePlan({
        topic: 'Mua thẻ game online',
        primaryKeyword: 'mua thẻ game online',
        contentType: ContentPlanContentType.GUIDE,
      }),
      doc,
      emptyContext(),
    );
    const dup = checks.find((c) => c.code === 'DUP_OPENING');
    expect(dup?.severity).toBe('warning');
    expect(dup?.message).toMatch(/2 cặp/);
  });

  it('allows "không đổi trả" but flags positive hoàn tiền promise', () => {
    const okDoc: ArticleDocumentV1 = {
      schemaVersion: '1.0',
      title: 'Scoin',
      seo: {
        metaTitle: 'x'.repeat(30),
        metaDescription: 'y'.repeat(130),
        focusKeyword: 'mua thẻ scoin',
      },
      sections: [
        {
          id: '1',
          type: 'paragraph',
          text: 'Mã thẻ thường không được đổi trả; nếu gặp lỗi, liên hệ nơi mua kèm mã đơn hàng.',
        },
      ],
      factRefs: [],
      internalLinks: [],
      qualityFlags: [],
    };
    expect(
      runEditorialSoftChecks(basePlan(), okDoc, emptyContext()).find(
        (c) => c.code === 'INVENTED_POLICY',
      )?.severity,
    ).toBe('info');

    const badDoc: ArticleDocumentV1 = {
      ...okDoc,
      sections: [
        {
          id: '1',
          type: 'paragraph',
          text: 'Nên chọn phương thức có bảo mật và hỗ trợ hoàn tiền khi có sự cố tại cửa hàng được cấp phép.',
        },
      ],
    };
    expect(
      runEditorialSoftChecks(basePlan(), badDoc, emptyContext()).find(
        (c) => c.code === 'INVENTED_POLICY',
      )?.severity,
    ).toBe('warning');
  });

  it('flags FAQ repeating H2 and overlapping payment section', () => {
    const doc: ArticleDocumentV1 = {
      schemaVersion: '1.0',
      title: 'Mua thẻ Scoin',
      seo: {
        metaTitle: 'x'.repeat(30),
        metaDescription: 'y'.repeat(130),
        focusKeyword: 'mua thẻ scoin online',
      },
      sections: [
        { id: 'h1', type: 'h2', text: 'Các bước mua thẻ Scoin online' },
        {
          id: 'u1',
          type: 'ul',
          items: [
            'Chọn mệnh giá trên CardOn',
            'Thanh toán qua MoMo hoặc chuyển khoản ngân hàng',
          ],
        },
        { id: 'h2', type: 'h2', text: 'Cách kiểm tra mã thẻ Scoin sau khi mua trên CardOn' },
        { id: 'u2', type: 'ul', items: ['Xem lịch sử đơn hàng'] },
        { id: 'h3', type: 'h2', text: 'Phương thức thanh toán an toàn khi mua thẻ Scoin online' },
        { id: 'u3', type: 'ul', items: ['MoMo', 'ZaloPay', 'Chuyển khoản'] },
        {
          id: 'f1',
          type: 'faq',
          faqItems: [
            {
              question: 'Làm thế nào để kiểm tra đơn hàng và mã thẻ trên CardOn?',
              answer: 'Đăng nhập và xem lịch sử đơn.',
            },
          ],
        },
      ],
      factRefs: [],
      internalLinks: [],
      qualityFlags: [],
    };
    const checks = runEditorialSoftChecks(
      basePlan({
        topic: 'Mua thẻ Scoin online',
        primaryKeyword: 'mua thẻ scoin online',
        contentType: ContentPlanContentType.GUIDE,
      }),
      doc,
      emptyContext(),
    );
    expect(checks.find((c) => c.code === 'FAQ_REPEATS_H2')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'OVERLAPPING_PAYMENT')?.severity).toBe('warning');
  });

  it('flags empty overview and repeated CardOn receive tips', () => {
    const tip =
      'Thanh toán thành công, mã thẻ hiện trên lịch sử đơn CardOn. Kiểm tra email hoặc spam. Liên hệ hỗ trợ CardOn nếu cần.';
    const doc: ArticleDocumentV1 = {
      schemaVersion: '1.0',
      title: 'Nạp tiền Viettel',
      seo: {
        metaTitle: 'x'.repeat(30),
        metaDescription: 'y'.repeat(130),
        focusKeyword: 'nạp tiền điện thoại viettel',
      },
      sections: [
        { id: 'h0', type: 'h2', text: 'Tổng quan về nạp tiền điện thoại Viettel' },
        {
          id: 'u0',
          type: 'ul',
          items: [
            'Nạp tiền điện thoại là cách bổ sung tài khoản',
            'Viettel là nhà mạng lớn với nhiều hình thức',
          ],
        },
        { id: 'h1', type: 'h2', text: 'Hướng dẫn nạp qua CardOn' },
        { id: 'u1', type: 'ul', items: [tip] },
        { id: 'h2', type: 'h2', text: 'Kiểm tra lịch sử trên CardOn' },
        { id: 'u2', type: 'ul', items: [tip] },
        {
          id: 'f1',
          type: 'faq',
          faqItems: [
            {
              question: 'Không nhận mã trên CardOn?',
              answer: tip,
            },
          ],
        },
      ],
      factRefs: [],
      internalLinks: [],
      qualityFlags: [],
    };
    const checks = runEditorialSoftChecks(
      basePlan({
        topic: 'Nạp tiền điện thoại Viettel',
        primaryKeyword: 'nạp tiền điện thoại viettel',
        contentType: ContentPlanContentType.GUIDE,
      }),
      doc,
      emptyContext(),
    );
    expect(checks.find((c) => c.code === 'EMPTY_OVERVIEW_H2')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'REPEATED_CARDON_TIPS')?.severity).toBe('warning');
  });

  it('flags invented SIM lock day windows', () => {
    const doc: ArticleDocumentV1 = {
      schemaVersion: '1.0',
      title: 'SIM lâu không sử dụng',
      seo: {
        metaTitle: 'x'.repeat(30),
        metaDescription: 'y'.repeat(130),
        focusKeyword: 'sim lâu không sử dụng',
      },
      sections: [
        {
          id: '1',
          type: 'paragraph',
          text: 'SIM Viettel trả trước nếu không phát sinh cước hoặc nạp tiền trong 90 ngày có thể bị khóa tạm thời.',
        },
      ],
      factRefs: [],
      internalLinks: [],
      qualityFlags: [],
    };
    const checks = runEditorialSoftChecks(
      basePlan({
        topic: 'SIM lâu không sử dụng',
        primaryKeyword: 'sim lâu không sử dụng',
        contentType: ContentPlanContentType.GUIDE,
      }),
      doc,
      emptyContext(),
    );
    expect(checks.find((c) => c.code === 'INVENTED_DURATION')?.severity).toBe('warning');
  });

  it('flags invented carrier causes and missing troubleshooting ol', () => {
    const doc: ArticleDocumentV1 = {
      schemaVersion: '1.0',
      title: 'Nạp tiền bị từ chối',
      seo: {
        metaTitle: 'x'.repeat(30),
        metaDescription: 'y'.repeat(130),
        focusKeyword: 'nạp tiền điện thoại online bị từ chối',
      },
      sections: [
        { id: 'h1', type: 'h2', text: 'Triệu chứng' },
        { id: 'u1', type: 'ul', items: ['Thông báo lỗi'] },
        { id: 'h2', type: 'h2', text: 'Nguyên nhân từ nhà mạng' },
        {
          id: 'u2',
          type: 'ul',
          items: [
            'Vinaphone: giới hạn số lần nạp trong ngày hoặc lỗi xác thực giao dịch',
            'Viettel: hệ thống My Viettel đang bảo trì',
          ],
        },
        { id: 'h3', type: 'h2', text: 'Cách xử lý' },
        {
          id: 'u3',
          type: 'ul',
          items: ['Kiểm tra số', 'Thử lại', 'Liên hệ hỗ trợ'],
        },
      ],
      factRefs: [],
      internalLinks: [],
      qualityFlags: [],
    };
    const checks = runEditorialSoftChecks(
      basePlan({
        topic: 'Nạp tiền điện thoại online bị từ chối',
        primaryKeyword: 'nạp tiền điện thoại online bị từ chối',
        contentType: ContentPlanContentType.TROUBLESHOOTING,
      }),
      doc,
      emptyContext(),
    );
    expect(checks.find((c) => c.code === 'INVENTED_CARRIER_CAUSE')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'TS_FIX_OL')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'TS_SUPPORT_H2')?.severity).toBe('warning');
  });

  it('flags generic advantages and invented SLA on auto-code guides', () => {
    const doc: ArticleDocumentV1 = {
      schemaVersion: '1.0',
      title: 'Mua thẻ nhận mã tự động',
      seo: {
        metaTitle: 'x'.repeat(30),
        metaDescription: 'y'.repeat(130),
        focusKeyword: 'mua thẻ game online nhận mã tự động',
      },
      sections: [
        {
          id: 'h1',
          type: 'h2',
          text: 'Ưu điểm của việc mua thẻ game online nhận mã tự động',
        },
        {
          id: 'u1',
          type: 'ul',
          items: [
            'Nhanh chóng nhận mã thẻ ngay sau khi thanh toán',
            'Tiện lợi, không cần đến cửa hàng vật lý',
            'Giảm thiểu rủi ro mất thẻ hoặc hư hỏng',
          ],
        },
        {
          id: 'p1',
          type: 'paragraph',
          text: 'Hệ thống gửi ngay lập tức. Bạn nhận mã ngay. Mã được gửi ngay lập tức qua email.',
        },
        { id: 'h2', type: 'h2', text: 'Thông tin về thẻ Zing và vai trò' },
        { id: 'u2', type: 'ul', items: ['Thẻ Zing phổ biến và được nhiều game thủ tin dùng'] },
      ],
      factRefs: [],
      internalLinks: [],
      qualityFlags: [],
    };
    const checks = runEditorialSoftChecks(
      basePlan({
        topic: 'Mua thẻ game online nhận mã tự động',
        primaryKeyword: 'mua thẻ game online nhận mã tự động',
        contentType: ContentPlanContentType.GUIDE,
      }),
      doc,
      emptyContext(),
    );
    expect(checks.find((c) => c.code === 'GENERIC_ADVANTAGES')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'INVENTED_SLA')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'THIN_BRAND_H2')?.severity).toBe('warning');
  });

  it('flags off-topic CTA H2 early on troubleshooting', () => {
    const doc: ArticleDocumentV1 = {
      schemaVersion: '1.0',
      title: 'Sim khóa',
      seo: {
        metaTitle: 'x'.repeat(30),
        metaDescription: 'y'.repeat(130),
        focusKeyword: 'sim bị khóa 1 chiều',
      },
      sections: [
        { id: '1', type: 'h2', text: 'So sánh các loại thẻ nạp Viettel' },
        { id: '2', type: 'paragraph', text: 'Nội dung bán thẻ.' },
        { id: '3', type: 'h2', text: 'Nguyên nhân' },
        { id: '4', type: 'paragraph', text: 'Hết tiền.' },
      ],
      factRefs: [],
      internalLinks: [],
      qualityFlags: [],
    };
    const checks = runEditorialSoftChecks(basePlan(), doc, emptyContext());
    const off = checks.find((c) => c.code === 'OFF_TOPIC_CTA');
    expect(off?.severity).toBe('warning');
  });

  it('computes text similarity for near-duplicates', () => {
    expect(
      textSimilarity(
        'Sim bị khóa một chiều liên lạc gọi đi',
        'Sim bị khóa một chiều liên lạc gọi đi hoặc gọi đến',
      ),
    ).toBeGreaterThan(0.5);
  });
});
