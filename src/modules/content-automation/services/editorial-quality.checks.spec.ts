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

  it('flags đổi/hoàn promise and resale advice', () => {
    const doc: ArticleDocumentV1 = {
      schemaVersion: '1.0',
      title: 'Mua nhầm thẻ',
      seo: {
        metaTitle: 'x'.repeat(30),
        metaDescription: 'y'.repeat(130),
        focusKeyword: 'mua nhầm thẻ điện thoại',
      },
      sections: [
        {
          id: '1',
          type: 'paragraph',
          text: 'Liên hệ nơi bán để yêu cầu hỗ trợ đổi hoặc hoàn tiền. Nếu không được, cân nhắc bán lại thẻ cho người cần.',
        },
      ],
      factRefs: [],
      internalLinks: [],
      qualityFlags: [],
    };
    const checks = runEditorialSoftChecks(
      basePlan({
        topic: 'Mua nhầm thẻ điện thoại',
        primaryKeyword: 'mua nhầm thẻ điện thoại',
        contentType: ContentPlanContentType.TROUBLESHOOTING,
      }),
      doc,
      emptyContext(),
    );
    expect(checks.find((c) => c.code === 'INVENTED_POLICY')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'GRAY_MARKET_RESALE')?.severity).toBe('warning');
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

  it('flags refund-heavy buy-card guide missing CardOn buy flow', () => {
    const doc: ArticleDocumentV1 = {
      schemaVersion: '1.0',
      title: 'Mua mã thẻ online',
      seo: {
        metaTitle: 'x'.repeat(30),
        metaDescription: 'y'.repeat(130),
        focusKeyword: 'mua mã thẻ online',
      },
      sections: [
        {
          id: 'p0',
          type: 'paragraph',
          text: 'Mua mã thẻ online là hình thức mua thẻ điện thoại hoặc thẻ game dưới dạng mã số.',
        },
        {
          id: 'h0',
          type: 'h2',
          text: 'Mua mã thẻ online là gì và cách thức hoạt động',
        },
        {
          id: 'u0',
          type: 'ul',
          items: [
            'Mã thẻ online là dãy số dùng để nạp tiền điện thoại hoặc thẻ game',
            'Người dùng mua qua website hoặc app',
            'Mã thẻ thường được gửi tự động sau khi thanh toán thành công',
          ],
        },
        { id: 'h1', type: 'h2', text: 'Chính sách hoàn tiền khi mua mã thẻ online' },
        { id: 'u1', type: 'ul', items: ['Thường không hoàn tiền', 'Liên hệ hỗ trợ nếu lỗi'] },
        { id: 'h2', type: 'h2', text: 'Nguyên nhân phổ biến dẫn đến yêu cầu hoàn tiền' },
        { id: 'u2', type: 'ul', items: ['Thanh toán xong không nhận mã', 'Mã lỗi'] },
        {
          id: 'h3',
          type: 'h2',
          text: 'Cách xử lý khi cần hoàn tiền hoặc giải quyết sự cố mua mã thẻ online',
        },
        { id: 'u3', type: 'ul', items: ['Kiểm tra lịch sử đơn CardOn', 'Liên hệ hỗ trợ'] },
      ],
      factRefs: [],
      internalLinks: [],
      qualityFlags: [],
    };
    const checks = runEditorialSoftChecks(
      basePlan({
        topic: 'Mua mã thẻ online',
        primaryKeyword: 'mua mã thẻ online',
        contentType: ContentPlanContentType.GUIDE,
      }),
      doc,
      emptyContext({
        userProvided: {
          topic: 'Mua mã thẻ online',
          primaryKeyword: 'mua mã thẻ online',
          searchIntent: 'INFORMATIONAL',
          contentType: 'GUIDE',
          audience: null,
          businessObjective: null,
          supportingKeywords: [],
          angle: null,
        },
      }),
    );
    expect(checks.find((c) => c.code === 'EMPTY_OVERVIEW_H2')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'REFUND_HEAVY_GUIDE')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'MISSING_BUY_FLOW')?.severity).toBe('warning');
  });

  it('flags multi-buy phone-card fluff: digits, quantity claim, thin carrier H2, missing ol', () => {
    const tip =
      'Mã hiện trên đơn CardOn. Kiểm tra email hoặc spam. Liên hệ hỗ trợ CardOn nếu cần.';
    const doc: ArticleDocumentV1 = {
      schemaVersion: '1.0',
      title: 'Mua nhiều mã thẻ điện thoại',
      seo: {
        metaTitle: 'x'.repeat(30),
        metaDescription: 'y'.repeat(130),
        focusKeyword: 'mua nhiều mã thẻ điện thoại',
      },
      sections: [
        {
          id: 'p0',
          type: 'paragraph',
          text: 'Mã thẻ điện thoại là dãy số dùng để nạp tiền. Bạn có thể mua nhiều mã cùng lúc.',
        },
        {
          id: 'h0',
          type: 'h2',
          text: 'Mã thẻ điện thoại là gì và có thể mua nhiều cùng lúc không?',
        },
        {
          id: 'u0',
          type: 'ul',
          items: [
            'Mã thẻ điện thoại là dãy số dùng để nạp tiền',
            'Có thể mua nhiều mã thẻ cùng lúc',
            'Giúp dự trữ hoặc nạp cho nhiều số',
          ],
        },
        { id: 'h1', type: 'h2', text: 'Đặc điểm mã thẻ Viettel' },
        {
          id: 'u1',
          type: 'ul',
          items: [
            'Mã thẻ Viettel thường gồm 13 hoặc 15 số',
            'Có thể mua nhiều mã thẻ Viettel trên nền tảng uy tín',
          ],
        },
        { id: 'h2', type: 'h2', text: 'Đặc điểm mã thẻ Mobifone' },
        {
          id: 'u2',
          type: 'ul',
          items: ['Mã thẻ Mobifone thường có 12 hoặc 15 số', 'Chú ý nhập đúng mã khi nạp'],
        },
        {
          id: 'h3',
          type: 'h2',
          text: 'Hướng dẫn mua nhiều mã thẻ điện thoại cùng lúc trên CardOn.vn',
        },
        {
          id: 'u3',
          type: 'ul',
          items: [
            'Chọn loại thẻ',
            'Chọn mệnh giá',
            'Thanh toán MoMo',
            tip,
            'Liên hệ hỗ trợ nếu cần',
          ],
        },
        { id: 'h4', type: 'h2', text: 'Cách kiểm tra mã thẻ trên CardOn.vn' },
        { id: 'u4', type: 'ul', items: [tip] },
        {
          id: 'f1',
          type: 'faq',
          faqItems: [
            {
              question: 'Không nhận mã sau thanh toán?',
              answer: tip,
            },
            {
              question: 'Có bị giới hạn số lượng không?',
              answer:
                'Hầu hết các nền tảng bán thẻ không giới hạn số lượng mã thẻ bạn có thể mua cùng lúc.',
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
        topic: 'Mua nhiều mã thẻ điện thoại cùng lúc',
        primaryKeyword: 'mua nhiều mã thẻ điện thoại',
        contentType: ContentPlanContentType.GUIDE,
      }),
      doc,
      emptyContext({
        userProvided: {
          topic: 'Mua nhiều mã thẻ điện thoại cùng lúc',
          primaryKeyword: 'mua nhiều mã thẻ điện thoại',
          searchIntent: 'INFORMATIONAL',
          contentType: 'GUIDE',
          audience: null,
          businessObjective: null,
          supportingKeywords: [],
          angle: null,
        },
      }),
    );
    expect(checks.find((c) => c.code === 'EMPTY_OVERVIEW_H2')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'INVENTED_CARD_DIGITS')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'INVENTED_QUANTITY_CLAIM')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'THIN_CARRIER_SPECS_H2')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'MISSING_BUY_FLOW')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'MULTI_BUY_QTY_STEP')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'REPEATED_CARDON_TIPS')?.severity).toBe('warning');
  });

  it('flags wrong-denom game-card guide: soft đổi, ul-only fix, avoid-use, Title Case anchors', () => {
    const doc: ArticleDocumentV1 = {
      schemaVersion: '1.0',
      title: 'Mua thẻ game sai mệnh giá',
      seo: {
        metaTitle: 'x'.repeat(30),
        metaDescription: 'y'.repeat(130),
        focusKeyword: 'mua thẻ game sai mệnh giá',
      },
      sections: [
        {
          id: 'p0',
          type: 'paragraph',
          text: 'Mua thẻ game sai mệnh giá là trường hợp phổ biến khi chọn nhầm giá trị thẻ.',
        },
        {
          id: 'h0',
          type: 'h2',
          text: 'Mua thẻ game sai mệnh giá là gì và nguyên nhân thường gặp',
        },
        {
          id: 'u0',
          type: 'ul',
          items: ['Mua thẻ có giá trị khác nhu cầu', 'Chọn nhầm mệnh giá khi mua'],
        },
        { id: 'h1', type: 'h2', text: 'Chính sách đổi thẻ game sai mệnh giá' },
        {
          id: 'u1',
          type: 'ul',
          items: [
            'Thường không đổi trả',
            'Một số nhà cung cấp có thể hỗ trợ đổi thẻ khi lỗi hệ thống',
            'Không nên kỳ vọng hoàn tiền tự do',
          ],
        },
        { id: 'h2', type: 'h2', text: 'Cách xử lý khi mua thẻ game sai mệnh giá' },
        {
          id: 'u2',
          type: 'ul',
          items: [
            'Kiểm tra đơn trên CardOn',
            'Liên hệ hỗ trợ kèm mã đơn',
            'Tránh sử dụng mã thẻ sai mệnh giá để không mất quyền lợi',
            'Cân nhắc mua thẻ mới đúng mệnh giá',
          ],
        },
        {
          id: 'lnk',
          type: 'internalLink',
          targetPageId: '00000000-0000-0000-0000-000000000099',
          anchorText: 'Nạp Sai Mệnh Giá Thẻ Game Phải Làm Sao?',
        },
      ],
      factRefs: [],
      internalLinks: [
        {
          sectionId: 'lnk',
          targetPageId: '00000000-0000-0000-0000-000000000099',
          anchorText: 'Nạp Sai Mệnh Giá Thẻ Game Phải Làm Sao?',
          validated: true,
        },
      ],
      qualityFlags: [],
    };
    const checks = runEditorialSoftChecks(
      basePlan({
        topic: 'Mua thẻ game sai mệnh giá',
        primaryKeyword: 'mua thẻ game sai mệnh giá',
        contentType: ContentPlanContentType.GUIDE,
      }),
      doc,
      emptyContext({
        userProvided: {
          topic: 'Mua thẻ game sai mệnh giá',
          primaryKeyword: 'mua thẻ game sai mệnh giá',
          searchIntent: 'INFORMATIONAL',
          contentType: 'GUIDE',
          audience: null,
          businessObjective: null,
          supportingKeywords: [],
          angle: null,
        },
      }),
    );
    expect(checks.find((c) => c.code === 'EMPTY_OVERVIEW_H2')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'INVENTED_POLICY')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'WRONG_CARD_FIX_OL')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'WRONG_DENOM_AVOID_USE')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'TITLE_CASE_ANCHOR')?.severity).toBe('warning');
  });

  it('flags stacked benefit H2s and closing CTA rehash on phone-card online guide', () => {
    const tip =
      'Mã hiện trên đơn CardOn. Kiểm tra email hoặc spam. Liên hệ hỗ trợ CardOn nếu cần.';
    const doc: ArticleDocumentV1 = {
      schemaVersion: '1.0',
      title: 'Mua thẻ điện thoại online 24/7',
      seo: {
        metaTitle: 'x'.repeat(30),
        metaDescription: 'y'.repeat(130),
        focusKeyword: 'mua thẻ điện thoại online',
      },
      sections: [
        {
          id: 'p0',
          type: 'paragraph',
          text: 'Mua thẻ điện thoại online giúp nạp tiền mọi lúc. CardOn cung cấp thẻ chính hãng.',
        },
        { id: 'h0', type: 'h2', text: 'Tại sao nên mua thẻ điện thoại online 24/7?' },
        {
          id: 'u0',
          type: 'ul',
          items: [
            'Chủ động mua bất cứ lúc nào, tiết kiệm thời gian',
            'Tránh thẻ giả nhờ nguồn chính hãng',
            'Nhận mã thẻ nhanh chóng trên trang đơn và email',
          ],
        },
        { id: 'h1', type: 'h2', text: 'Các bước mua thẻ điện thoại nhanh chóng trên CardOn.vn' },
        {
          id: 'u1',
          type: 'ul',
          items: [
            'Chọn nhà mạng và mệnh giá',
            'Thanh toán MoMo',
            tip,
            'Liên hệ hỗ trợ nếu cần',
          ],
        },
        { id: 'h2', type: 'h2', text: 'Lợi ích khi mua thẻ điện thoại tại CardOn.vn' },
        {
          id: 'u2',
          type: 'ul',
          items: [
            'Nguồn thẻ chính hãng, giao diện thân thiện',
            'Giao mã tự động, nhanh sau thanh toán',
            'Thanh toán linh hoạt, hỗ trợ tận tình',
          ],
        },
        { id: 'h3', type: 'h2', text: 'Cách kiểm tra đơn hàng và mã thẻ trên CardOn' },
        { id: 'u3', type: 'ul', items: [tip] },
        {
          id: 'h4',
          type: 'h2',
          text: 'Mua thẻ điện thoại online 24/7 tại CardOn: Bắt đầu ngay hôm nay',
        },
        {
          id: 'u4',
          type: 'ul',
          items: [
            'Truy cập CardOn.vn và chọn thẻ',
            'Thanh toán và nhận mã trên trang chi tiết đơn hàng',
            'Liên hệ hỗ trợ nếu cần',
          ],
        },
        {
          id: 'f1',
          type: 'faq',
          faqItems: [{ question: 'Mã thẻ không nhận được sau khi thanh toán?', answer: tip }],
        },
      ],
      factRefs: [],
      internalLinks: [],
      qualityFlags: [],
    };
    const checks = runEditorialSoftChecks(
      basePlan({
        topic: 'Mua thẻ điện thoại online 24/7',
        primaryKeyword: 'mua thẻ điện thoại online',
        contentType: ContentPlanContentType.GUIDE,
      }),
      doc,
      emptyContext({
        userProvided: {
          topic: 'Mua thẻ điện thoại online 24/7',
          primaryKeyword: 'mua thẻ điện thoại online',
          searchIntent: 'INFORMATIONAL',
          contentType: 'GUIDE',
          audience: null,
          businessObjective: null,
          supportingKeywords: [],
          angle: null,
        },
      }),
    );
    expect(checks.find((c) => c.code === 'DUPLICATE_ADVANTAGE_H2')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'CLOSING_CTA_REHASH')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'MISSING_BUY_FLOW')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'REPEATED_CARDON_TIPS')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'INVENTED_SLA')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'GENERIC_ADVANTAGES')?.severity).toBe('warning');
  });

  it('flags Scoin guide: empty overview, missing buy ol, redeem mixed buy tip, game list, repeated tips', () => {
    const tip =
      'Mã thẻ thường hiện trên trang đơn CardOn hoặc email. Kiểm tra spam. Liên hệ hỗ trợ CardOn.';
    const doc: ArticleDocumentV1 = {
      schemaVersion: '1.0',
      title: 'Thẻ Scoin dùng game nào',
      seo: {
        metaTitle: 'x'.repeat(30),
        metaDescription: 'y'.repeat(130),
        focusKeyword: 'thẻ scoin',
      },
      sections: [
        {
          id: 'p0',
          type: 'paragraph',
          text: 'Thẻ Scoin dùng để nạp tiền vào các game do VTC phát hành hoặc hợp tác.',
        },
        { id: 'h0', type: 'h2', text: 'Tổng quan về thẻ Scoin và vai trò trong game' },
        {
          id: 'u0',
          type: 'ul',
          items: [
            'Thẻ Scoin là thẻ game dùng để nạp tiền vào game VTC',
            'Giúp mua vật phẩm, nâng cấp trong game',
            'Phù hợp với người chơi game online tại Việt Nam',
          ],
        },
        { id: 'h1', type: 'h2', text: 'Danh sách các game dùng thẻ Scoin' },
        {
          id: 'u1',
          type: 'ul',
          items: [
            'Game Võ Lâm Truyền Kỳ (VLTK)',
            'Game Đột Kích (Crossfire)',
            'Game Gunny Origin',
            'Game Audition',
            'Game Thục Sơn Kỳ Hiệp',
          ],
        },
        { id: 'h2', type: 'h2', text: 'Cách nạp thẻ Scoin vào game' },
        {
          id: 'u2',
          type: 'ul',
          items: [
            'Truy cập trang nạp tiền chính thức của game',
            'Chọn phương thức nạp bằng thẻ Scoin',
            'Nhập mã thẻ và seri',
            tip,
          ],
        },
        { id: 'h3', type: 'h2', text: 'Kiểm tra đơn hàng và mã thẻ Scoin trên CardOn' },
        { id: 'u3', type: 'ul', items: [tip] },
        {
          id: 'f1',
          type: 'faq',
          faqItems: [{ question: 'Không nhận được mã thẻ sau khi mua?', answer: tip }],
        },
      ],
      factRefs: [],
      internalLinks: [],
      qualityFlags: [],
    };
    const checks = runEditorialSoftChecks(
      basePlan({
        topic: 'Thẻ Scoin dùng được cho game nào',
        primaryKeyword: 'thẻ scoin',
        contentType: ContentPlanContentType.GUIDE,
      }),
      doc,
      emptyContext({
        userProvided: {
          topic: 'Thẻ Scoin dùng được cho game nào',
          primaryKeyword: 'thẻ scoin',
          searchIntent: 'INFORMATIONAL',
          contentType: 'GUIDE',
          audience: null,
          businessObjective: null,
          supportingKeywords: [],
          angle: null,
        },
      }),
    );
    expect(checks.find((c) => c.code === 'EMPTY_OVERVIEW_H2')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'MISSING_BUY_FLOW')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'REDEEM_MIXED_BUY_TIP')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'GAME_LIST_NO_DISCLAIMER')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'REPEATED_CARDON_TIPS')?.severity).toBe('warning');
  });

  it('flags unusual-tx troubleshooting: filler opener, wait SLA, FAQ restates fix, delivery-SLA link', () => {
    const doc: ArticleDocumentV1 = {
      schemaVersion: '1.0',
      title: 'Giao dịch mua thẻ bất thường',
      seo: {
        metaTitle: 'x'.repeat(30),
        metaDescription: 'y'.repeat(130),
        focusKeyword: 'giao dịch mua thẻ bất thường',
      },
      sections: [
        {
          id: 'p0',
          type: 'paragraph',
          text: 'Giao dịch mua thẻ bất thường có thể gây ra nhiều phiền toái nếu không xử lý. Tránh thiệt hại không đáng có.',
        },
        { id: 'h0', type: 'h2', text: 'Triệu chứng nhận biết giao dịch mua thẻ bất thường' },
        {
          id: 'u0',
          type: 'ul',
          items: [
            'Giao dịch mua thẻ không do bạn thực hiện',
            'Trừ tiền nhưng không nhận được mã thẻ',
          ],
        },
        { id: 'h1', type: 'h2', text: 'Nguyên nhân phổ biến' },
        { id: 'h1a', type: 'h3', text: 'Vấn đề thanh toán' },
        { id: 'u1', type: 'ul', items: ['Thanh toán lỗi hệ thống'] },
        { id: 'h2', type: 'h2', text: 'Cách xử lý từng bước khi phát hiện giao dịch mua thẻ bất thường' },
        {
          id: 'o1',
          type: 'ol',
          items: [
            'Kiểm tra chi tiết đơn hàng trên lịch sử đơn CardOn',
            'Xác nhận mã thẻ trên trang đơn hoặc email, kiểm tra spam',
            'Liên hệ hỗ trợ nơi bán kèm mã đơn',
            'Nếu nghi gian lận, liên hệ ngân hàng hoặc ví',
            'Lưu biên lai và bằng chứng',
          ],
        },
        { id: 'h3', type: 'h2', text: 'Khi nào cần hỗ trợ từ nhà mạng hoặc CardOn' },
        {
          id: 'u2',
          type: 'ul',
          items: [
            'Không nhận được mã thẻ sau thời gian chờ hợp lý',
            'Phát hiện giao dịch không do bạn thực hiện',
          ],
        },
        {
          id: 'f1',
          type: 'faq',
          faqItems: [
            {
              question: 'Tôi không nhận được mã thẻ sau khi thanh toán thì phải làm sao?',
              answer:
                'Kiểm tra lịch sử đơn và email spam. Liên hệ hỗ trợ nơi mua kèm mã đơn.',
            },
          ],
        },
        {
          id: 'lnk',
          type: 'internalLink',
          targetPageId: '00000000-0000-0000-0000-000000000099',
          anchorText: 'Mua thẻ game online bao lâu nhận được mã?',
        },
      ],
      factRefs: [],
      internalLinks: [
        {
          sectionId: 'lnk',
          targetPageId: '00000000-0000-0000-0000-000000000099',
          anchorText: 'Mua thẻ game online bao lâu nhận được mã?',
          validated: true,
        },
      ],
      qualityFlags: [],
    };
    const checks = runEditorialSoftChecks(
      basePlan({
        topic: 'Giao dịch mua thẻ bất thường',
        primaryKeyword: 'giao dịch mua thẻ bất thường',
        contentType: ContentPlanContentType.TROUBLESHOOTING,
      }),
      doc,
      emptyContext({
        userProvided: {
          topic: 'Giao dịch mua thẻ bất thường',
          primaryKeyword: 'giao dịch mua thẻ bất thường',
          searchIntent: 'INFORMATIONAL',
          contentType: 'TROUBLESHOOTING',
          audience: null,
          businessObjective: null,
          supportingKeywords: [],
          angle: null,
        },
      }),
    );
    expect(checks.find((c) => c.code === 'FILLER_PHRASES')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'INVENTED_WAIT_WINDOW')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'FAQ_RESTATES_FIX')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'DELIVERY_SLA_LINK')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'TS_FIX_OL')?.severity).toBe('info');
  });

  it('flags e-card buy-error guide: wait hours, FAQ restates fix, promo brand + Title Case links', () => {
    const doc: ArticleDocumentV1 = {
      schemaVersion: '1.0',
      title: 'Lỗi khi mua thẻ điện tử online',
      seo: {
        metaTitle: 'x'.repeat(30),
        metaDescription: 'y'.repeat(130),
        focusKeyword: 'lỗi khi mua thẻ điện tử online',
      },
      sections: [
        {
          id: 'p0',
          type: 'paragraph',
          text: 'Mua thẻ điện tử online đôi khi gặp lỗi phổ biến khiến mất tiền hoặc không dùng được mã.',
        },
        { id: 'h0', type: 'h2', text: 'Triệu chứng thường gặp khi mua thẻ điện tử online sai sót' },
        {
          id: 'u0',
          type: 'ul',
          items: ['Không nhận được mã thẻ sau thanh toán', 'Mã sai mệnh giá hoặc nhà mạng'],
        },
        { id: 'h1', type: 'h2', text: 'Nguyên nhân phổ biến' },
        { id: 'h1a', type: 'h3', text: 'Lỗi thanh toán' },
        { id: 'u1', type: 'ul', items: ['Thanh toán bị gián đoạn'] },
        { id: 'h2', type: 'h2', text: 'Cách xử lý từng bước khi gặp lỗi mua thẻ điện tử online' },
        {
          id: 'o1',
          type: 'ol',
          items: [
            'Kiểm tra trạng thái đơn trên lịch sử đơn CardOn',
            'Xem email xác nhận và thư mục spam',
            'Đối chiếu mệnh giá và nhà mạng',
            'Liên hệ hỗ trợ nơi mua kèm mã đơn',
            'Nếu nghi gian lận, liên hệ ngân hàng hoặc ví',
          ],
        },
        { id: 'h3', type: 'h2', text: 'Khi nào cần liên hệ hỗ trợ nhà mạng hoặc CardOn.vn' },
        {
          id: 'u2',
          type: 'ul',
          items: [
            'Thanh toán thành công nhưng không nhận được mã thẻ sau nhiều giờ',
            'Mã thẻ không sử dụng được khi nạp',
          ],
        },
        {
          id: 'f1',
          type: 'faq',
          faqItems: [
            {
              question: 'Không nhận được mã thẻ sau khi thanh toán phải làm sao?',
              answer: 'Kiểm tra lịch sử đơn và email spam. Liên hệ hỗ trợ kèm mã đơn.',
            },
          ],
        },
        {
          id: 'lnk1',
          type: 'internalLink',
          targetPageId: '00000000-0000-0000-0000-000000000091',
          anchorText: 'Mua Thẻ Garena Giá Rẻ Ở Đâu? Kinh Nghiệm Không Bị Lừa',
        },
        {
          id: 'lnk2',
          type: 'internalLink',
          targetPageId: '00000000-0000-0000-0000-000000000092',
          anchorText: 'Thẻ Vcoin Chính Hãng: Tránh Mua Phải Thẻ Không Rõ Nguồn Gốc',
        },
      ],
      factRefs: [],
      internalLinks: [
        {
          sectionId: 'lnk1',
          targetPageId: '00000000-0000-0000-0000-000000000091',
          anchorText: 'Mua Thẻ Garena Giá Rẻ Ở Đâu? Kinh Nghiệm Không Bị Lừa',
          validated: true,
        },
        {
          sectionId: 'lnk2',
          targetPageId: '00000000-0000-0000-0000-000000000092',
          anchorText: 'Thẻ Vcoin Chính Hãng: Tránh Mua Phải Thẻ Không Rõ Nguồn Gốc',
          validated: true,
        },
      ],
      qualityFlags: [],
    };
    const checks = runEditorialSoftChecks(
      basePlan({
        topic: 'Lỗi khi mua thẻ điện tử online',
        primaryKeyword: 'lỗi khi mua thẻ điện tử online',
        contentType: ContentPlanContentType.TROUBLESHOOTING,
      }),
      doc,
      emptyContext({
        userProvided: {
          topic: 'Lỗi khi mua thẻ điện tử online',
          primaryKeyword: 'lỗi khi mua thẻ điện tử online',
          searchIntent: 'INFORMATIONAL',
          contentType: 'TROUBLESHOOTING',
          audience: null,
          businessObjective: null,
          supportingKeywords: [],
          angle: null,
        },
      }),
    );
    expect(checks.find((c) => c.code === 'INVENTED_WAIT_WINDOW')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'FAQ_RESTATES_FIX')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'PROMO_BRAND_LINK')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'TITLE_CASE_ANCHOR')?.severity).toBe('warning');
  });

  it('flags hung e-card tx guide: filler opener, FAQ restates, SLA + off-topic links, promise resend', () => {
    const doc: ArticleDocumentV1 = {
      schemaVersion: '1.0',
      title: 'Giao dịch mua thẻ điện tử bị treo',
      seo: {
        metaTitle: 'x'.repeat(30),
        metaDescription: 'y'.repeat(130),
        focusKeyword: 'giao dịch mua thẻ điện tử bị treo',
      },
      sections: [
        {
          id: 'p0',
          type: 'paragraph',
          text: 'Giao dịch mua thẻ điện tử bị treo gây khó chịu và cần xử lý kịp thời để tránh mất tiền oan.',
        },
        { id: 'h0', type: 'h2', text: 'Triệu chứng giao dịch mua thẻ điện tử bị treo' },
        {
          id: 'u0',
          type: 'ul',
          items: ['Thanh toán đã trừ tiền nhưng không nhận được mã', 'Trạng thái đang xử lý'],
        },
        { id: 'h1', type: 'h2', text: 'Nguyên nhân phổ biến khiến mua thẻ điện tử bị treo' },
        { id: 'h1a', type: 'h3', text: 'Lỗi trong quá trình thanh toán' },
        { id: 'u1', type: 'ul', items: ['Thanh toán bị gián đoạn hoặc lỗi mạng'] },
        { id: 'h2', type: 'h2', text: 'Cách xử lý khi giao dịch mua thẻ điện tử bị treo' },
        {
          id: 'o1',
          type: 'ol',
          items: [
            'Kiểm tra trạng thái đơn trên lịch sử mua thẻ CardOn',
            'Xem email kể cả thư mục spam',
            'Tải lại trang đơn hàng',
            'Đối chiếu giao dịch trên ví hoặc ngân hàng',
            'Liên hệ hỗ trợ nơi mua kèm mã đơn',
          ],
        },
        { id: 'h3', type: 'h2', text: 'Khi nào cần liên hệ hỗ trợ nhà mạng hoặc CardOn' },
        {
          id: 'u2',
          type: 'ul',
          items: ['Không nhận được mã sau thanh toán thành công', 'Trạng thái đơn không rõ'],
        },
        {
          id: 'f1',
          type: 'faq',
          faqItems: [
            {
              question: 'Tôi đã thanh toán nhưng không nhận được mã thẻ, phải làm sao?',
              answer:
                'Kiểm tra lịch sử đơn và email spam. Liên hệ hỗ trợ nơi mua kèm mã đơn để được gửi lại mã thẻ.',
            },
          ],
        },
        {
          id: 'lnk1',
          type: 'internalLink',
          targetPageId: '00000000-0000-0000-0000-000000000093',
          anchorText: 'Mua thẻ game online có an toàn không?',
        },
        {
          id: 'lnk2',
          type: 'internalLink',
          targetPageId: '00000000-0000-0000-0000-000000000094',
          anchorText: 'Mua Thẻ Game Online Bao Lâu Nhận Được Mã?',
        },
        {
          id: 'lnk3',
          type: 'internalLink',
          targetPageId: '00000000-0000-0000-0000-000000000095',
          anchorText: 'Thẻ Điện Thoại Có Nạp Game Được Không?',
        },
      ],
      factRefs: [],
      internalLinks: [
        {
          sectionId: 'lnk1',
          targetPageId: '00000000-0000-0000-0000-000000000093',
          anchorText: 'Mua thẻ game online có an toàn không?',
          validated: true,
        },
        {
          sectionId: 'lnk2',
          targetPageId: '00000000-0000-0000-0000-000000000094',
          anchorText: 'Mua Thẻ Game Online Bao Lâu Nhận Được Mã?',
          validated: true,
        },
        {
          sectionId: 'lnk3',
          targetPageId: '00000000-0000-0000-0000-000000000095',
          anchorText: 'Thẻ Điện Thoại Có Nạp Game Được Không?',
          validated: true,
        },
      ],
      qualityFlags: [],
    };
    const checks = runEditorialSoftChecks(
      basePlan({
        topic: 'Giao dịch mua thẻ điện tử bị treo',
        primaryKeyword: 'giao dịch mua thẻ điện tử bị treo',
        contentType: ContentPlanContentType.TROUBLESHOOTING,
      }),
      doc,
      emptyContext({
        userProvided: {
          topic: 'Giao dịch mua thẻ điện tử bị treo',
          primaryKeyword: 'giao dịch mua thẻ điện tử bị treo',
          searchIntent: 'INFORMATIONAL',
          contentType: 'TROUBLESHOOTING',
          audience: null,
          businessObjective: null,
          supportingKeywords: [],
          angle: null,
        },
      }),
    );
    expect(checks.find((c) => c.code === 'FILLER_PHRASES')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'FAQ_RESTATES_FIX')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'DELIVERY_SLA_LINK')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'PROMO_BRAND_LINK')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'PROMISE_RESEND_CODE')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'TITLE_CASE_ANCHOR')?.severity).toBe('warning');
  });

  it('flags no-account topup guide: multi-platform invent, dual safety, thin carrier compare, absolute safe', () => {
    const doc: ArticleDocumentV1 = {
      schemaVersion: '1.0',
      title: 'Nạp tiền điện thoại online có cần đăng ký tài khoản không?',
      seo: {
        metaTitle: 'x'.repeat(30),
        metaDescription: 'y'.repeat(130),
        focusKeyword: 'nạp tiền điện thoại online có cần đăng ký tài khoản',
      },
      sections: [
        {
          id: 'p0',
          type: 'paragraph',
          text: 'Nạp tiền điện thoại online tiện lợi. Nhiều người hỏi có cần đăng ký tài khoản không.',
        },
        { id: 'h0', type: 'h2', text: 'Nạp tiền điện thoại online có cần đăng ký tài khoản không?' },
        {
          id: 'u0',
          type: 'ul',
          items: [
            'Không bắt buộc đăng ký tài khoản tại nhiều nền tảng, bao gồm CardOn.vn',
            'Có thể nạp bằng cách nhập số điện thoại và chọn mệnh giá mà không cần tài khoản',
          ],
        },
        { id: 'h1', type: 'h2', text: 'Các cách nạp tiền điện thoại phổ biến hiện nay' },
        {
          id: 'u1',
          type: 'ul',
          items: ['Thẻ cào USSD', 'App nhà mạng', 'CardOn.vn không cần tài khoản'],
        },
        { id: 'h2', type: 'h2', text: 'Hướng dẫn nạp tiền điện thoại trên CardOn.vn không cần tài khoản' },
        {
          id: 'o1',
          type: 'ol',
          items: [
            'Truy cập trang nạp tiền trên CardOn.vn',
            'Chọn nhà mạng và nhập số điện thoại',
            'Chọn mệnh giá rồi thanh toán MoMo hoặc chuyển khoản',
            'Mã thẻ hiện trên trang đơn và gửi qua email nếu có',
            'Kiểm tra email spam, liên hệ hỗ trợ nếu cần',
          ],
        },
        { id: 'h3', type: 'h2', text: 'Kiểm tra đơn hàng và mã thẻ trên CardOn.vn sau khi nạp tiền' },
        {
          id: 'u2',
          type: 'ul',
          items: [
            'Xem lịch sử đơn hàng trên CardOn.vn',
            'Kiểm tra email nhận mã thẻ kể cả spam',
            'Liên hệ hỗ trợ CardOn nếu không nhận được mã',
          ],
        },
        { id: 'h4', type: 'h2', text: 'Lưu ý khi nạp tiền điện thoại online không cần tài khoản' },
        {
          id: 'u3',
          type: 'ul',
          items: ['Chọn website uy tín như CardOn', 'Lưu biên lai', 'Kiểm tra email và spam'],
        },
        {
          id: 'h5',
          type: 'h2',
          text: 'So sánh nhanh cách nạp tiền Viettel, Mobifone và Vinaphone online',
        },
        {
          id: 'u4',
          type: 'ul',
          items: [
            'Viettel: My Viettel, thẻ cào, CardOn',
            'Mobifone: My Mobifone, thẻ cào, website uy tín',
            'Vinaphone: My Vinaphone, thẻ cào',
            'Tất cả đều cho phép nạp không cần tài khoản trên các nền tảng trung gian',
          ],
        },
        { id: 'h6', type: 'h2', text: 'Lưu ý an toàn khi nạp tiền điện thoại online' },
        {
          id: 'u5',
          type: 'ul',
          items: [
            'Chỉ nạp trên trang uy tín, có chứng nhận và phản hồi tốt',
            'Không chia sẻ OTP',
            'Thanh toán MoMo hoặc ngân hàng',
          ],
        },
        {
          id: 'f1',
          type: 'faq',
          faqItems: [
            {
              question: 'Nạp tiền online không cần tài khoản có an toàn không?',
              answer: 'Nếu chọn CardOn và thanh toán ví điện tử thì rất an toàn.',
            },
            {
              question: 'Nếu không nhận được mã thẻ sau khi thanh toán thì làm sao?',
              answer: 'Kiểm tra email spam rồi liên hệ hỗ trợ CardOn kèm mã đơn.',
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
        topic: 'Nạp tiền điện thoại online có cần đăng ký tài khoản không',
        primaryKeyword: 'nạp tiền điện thoại online có cần đăng ký tài khoản',
        contentType: ContentPlanContentType.GUIDE,
      }),
      doc,
      emptyContext({
        userProvided: {
          topic: 'Nạp tiền điện thoại online có cần đăng ký tài khoản không',
          primaryKeyword: 'nạp tiền điện thoại online có cần đăng ký tài khoản',
          searchIntent: 'INFORMATIONAL',
          contentType: 'GUIDE',
          audience: null,
          businessObjective: null,
          supportingKeywords: [],
          angle: null,
        },
      }),
    );
    expect(checks.find((c) => c.code === 'INVENTED_NO_ACCOUNT_PLATFORMS')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'GUEST_EMAIL_MISSING')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'OVERLAPPING_SAFETY_H2')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'THIN_CARRIER_COMPARE')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'INVENTED_POLICY')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'ABSOLUTE_SAFE_CLAIM')?.severity).toBe('warning');
    expect(checks.find((c) => c.code === 'REPEATED_CARDON_TIPS')?.severity).toBe('warning');
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
