import { Injectable } from '@nestjs/common';
import { ContentPlanContentType, type ContentPlan } from '@prisma/client';
import { OUTLINE_VERSION, type OutlineV1 } from '../entities/outline.types';
import type { GenerationContext } from '../entities/generation-context.types';
import { isIntelligenceSnapshotV1 } from '../entities/intelligence-snapshot.types';

@Injectable()
export class HeuristicOutlineStrategy {
  buildOutline(plan: ContentPlan, context: GenerationContext): OutlineV1 {
    const title = plan.suggestedTitle?.trim() || plan.topic.trim();
    const intelligence = isIntelligenceSnapshotV1(plan.intelligenceSnapshot)
      ? plan.intelligenceSnapshot
      : null;

    const sections =
      plan.contentType === ContentPlanContentType.TROUBLESHOOTING
        ? this.troubleshootingSections(plan, context)
        : this.defaultSections(plan, context);

    if (intelligence?.internalLinkCandidates?.length) {
      sections.push({
        id: 'sec-links',
        heading: 'Tham khảo thêm',
        level: 2,
        summary: 'Liên kết tới bài liên quan đã publish (internalLink only).',
        keyPoints: intelligence.internalLinkCandidates.slice(0, 5).map((l) => l.title),
        targetWordCount: 80,
      });
    }

    return {
      version: OUTLINE_VERSION,
      generatedAt: new Date().toISOString(),
      source: 'HEURISTIC',
      title,
      excerpt: `Hướng dẫn xử lý ${plan.primaryKeyword} trên CardOn.vn`,
      sections,
      seoNotes: {
        metaTitleHint: title.slice(0, 60),
        metaDescriptionHint: `${plan.topic} — ${plan.primaryKeyword}`.slice(0, 155),
      },
    };
  }

  private troubleshootingSections(
    plan: ContentPlan,
    context: GenerationContext,
  ): OutlineV1['sections'] {
    return [
      {
        id: 'sec-symptoms',
        heading: 'Triệu chứng / dấu hiệu thường gặp',
        level: 2,
        summary: `Liệt kê dấu hiệu khi gặp "${plan.primaryKeyword}" trên CardOn.`,
        keyPoints: [
          'Không hoàn tất thanh toán',
          'Giao dịch treo / chờ xác nhận lâu',
          'Trừ tiền nhưng chưa nhận kết quả',
          ...(context.userProvided.supportingKeywords ?? []).slice(0, 2),
        ],
        targetWordCount: 120,
      },
      {
        id: 'sec-causes',
        heading: 'Nguyên nhân phổ biến',
        level: 2,
        summary: 'Nhóm nguyên nhân — chi tiết ở các H3 bên dưới.',
        keyPoints: ['Phân nhóm nguyên nhân, tránh đoạn văn dài'],
        targetWordCount: 40,
      },
      {
        id: 'sec-cause-user',
        heading: 'Phía người dùng / thao tác',
        level: 3,
        summary: 'Sai số tiền, đóng trang giữa chừng, quét nhầm QR…',
        keyPoints: ['Kiểm tra số tiền', 'Không tắt trang khi đang chờ'],
        targetWordCount: 80,
      },
      {
        id: 'sec-cause-network',
        heading: 'Mạng / thiết bị / ứng dụng ngân hàng',
        level: 3,
        summary: 'Mạng yếu, app bank cũ, cache…',
        keyPoints: ['Đường truyền', 'Cập nhật app ngân hàng'],
        targetWordCount: 80,
      },
      {
        id: 'sec-cause-bank',
        heading: 'Ngân hàng / cổng thanh toán VietQR',
        level: 3,
        summary: 'Bảo trì, hạn mức, từ chối giao dịch…',
        keyPoints: ['Hạn mức', 'Bảo trì ngân hàng'],
        targetWordCount: 80,
      },
      {
        id: 'sec-cause-cardon',
        heading: 'Phía CardOn / đơn hàng',
        level: 3,
        summary: 'Đơn chờ đối soát, chậm cập nhật trạng thái…',
        keyPoints: ['Kiểm tra trạng thái đơn trên CardOn'],
        targetWordCount: 80,
      },
      {
        id: 'sec-steps',
        heading: 'Cách xử lý từng bước',
        level: 2,
        summary: 'Writer MUST output type ol với 5–8 bước cụ thể trên CardOn.',
        keyPoints: [
          'Kiểm tra kết nối mạng và thử lại',
          'Xác nhận số tiền / nội dung chuyển khoản khớp đơn',
          'Không tạo đơn trùng khi đang chờ',
          'Kiểm tra trạng thái đơn trên CardOn',
          'Thử phương thức thanh toán khác nếu VietQR lỗi',
          'Chuẩn bị mã đơn + thời điểm trước khi liên hệ hỗ trợ',
          ...(context.userProvided.angle ? [context.userProvided.angle] : []),
        ],
        targetWordCount: 220,
      },
      {
        id: 'sec-support',
        heading: 'Khi nào cần liên hệ hỗ trợ',
        level: 2,
        summary: 'Điều kiện escalate + checklist thông tin gửi hỗ trợ CardOn.',
        keyPoints: ['Mã đơn', 'Thời điểm giao dịch', 'Ảnh màn hình / biên lai'],
        targetWordCount: 100,
      },
      {
        id: 'sec-faq',
        heading: 'Câu hỏi thường gặp',
        level: 2,
        summary: 'Writer MUST emit type faq với 3–5 faqItems.',
        keyPoints: [
          `Đã chuyển khoản nhưng đơn "${plan.primaryKeyword}" vẫn lỗi?`,
          'Có bị trừ tiền hai lần không?',
          'Bao lâu thì đơn được cập nhật?',
        ],
        targetWordCount: 180,
      },
    ];
  }

  private defaultSections(
    plan: ContentPlan,
    context: GenerationContext,
  ): OutlineV1['sections'] {
    return [
      {
        id: 'sec-intro',
        heading: `Tổng quan về ${plan.primaryKeyword}`,
        level: 2,
        summary: `Mở bài ngắn (≤3 câu) về "${plan.topic}".`,
        keyPoints: [plan.primaryKeyword, ...(context.userProvided.supportingKeywords ?? []).slice(0, 3)],
        targetWordCount: 120,
      },
      {
        id: 'sec-main',
        heading: 'Nội dung chính',
        level: 2,
        summary: 'Triển khai theo search intent và content type; dùng ul/ol khi có bước.',
        keyPoints: [
          `Intent: ${plan.searchIntent}`,
          `Type: ${plan.contentType}`,
          ...(context.userProvided.angle ? [context.userProvided.angle] : []),
        ],
        targetWordCount: 400,
      },
      {
        id: 'sec-conclusion',
        heading: 'Tóm tắt và bước tiếp theo',
        level: 2,
        summary: 'Tóm tắt ngắn + CTA CardOn.',
        keyPoints: ['Tóm tắt', 'CTA'],
        targetWordCount: 100,
      },
    ];
  }
}
