/** Parse comma/semicolon-separated supporting keywords (trim empties). */
export function parseSupportingKeywords(raw: string): string[] {
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatSupportingKeywords(keywords: string[] | undefined | null): string {
  return (keywords ?? []).join(', ');
}

/**
 * Suggest content angles from topic + content type.
 * Angle = unique approach for AI (not the SEO title).
 */
export function suggestContentAngles(topic: string, contentType: string): string[] {
  const t = topic.trim().replace(/\s+/g, ' ');
  const short = t.length > 80 ? `${t.slice(0, 77)}…` : t;

  const byType: Record<string, string[]> = {
    TROUBLESHOOTING: [
      'Checklist từng bước trên CardOn; nhóm nguyên nhân H3; FAQ tối đa 3 câu không trùng H2',
      'Ưu tiên xử lý khi đã trừ tiền / đơn treo; nêu rõ khi nào liên hệ hỗ trợ kèm mã đơn',
      'Tránh lý thuyết chung — chỉ triệu chứng, nguyên nhân, bước xử lý, FAQ ngắn',
    ],
    TUTORIAL: [
      'Hướng dẫn từng bước mua/nạp trên CardOn; có điều kiện trước khi làm và kết quả mong đợi',
      'Screenshot-flow bằng mô tả bước; nhấn mạnh copy mã thẻ an toàn',
      'Bài cho người mới: bước ngắn, ít thuật ngữ, CTA rõ về CardOn',
    ],
    GUIDE: [
      'Định nghĩa ngắn + so sánh loại thẻ + hướng dẫn mua/nạp cụ thể trên CardOn; FAQ ≤ 3',
      'Thân bài sâu (loại thẻ / cách chọn); FAQ không lặp lại các H2',
      'Góc người mới bắt đầu: giải thích dễ hiểu, có bảng/list loại thẻ phổ biến',
    ],
    EXPLAINER: [
      'Giải thích khái niệm trước, ví dụ thực tế sau; liên hệ sản phẩm CardOn ở cuối',
      'Tránh lan man — mỗi H2 một ý; dùng list thay đoạn văn dài',
    ],
    COMPARISON: [
      'So sánh rõ tiêu chí (tốc độ, uy tín, giá, hỗ trợ); kết luận khi nào chọn CardOn',
      'Bảng so sánh + khuyến nghị theo nhu cầu người dùng',
    ],
    PRODUCT: [
      'Tập trung lợi ích mua tại CardOn (nhanh, chính hãng, hỗ trợ); CTA mua rõ',
      'Mô tả sản phẩm + cách nhận mã + lưu ý sử dụng; FAQ ngắn về giao dịch',
    ],
    FAQ: [
      'Chỉ Q&A hữu ích; mỗi câu trả lời 2–4 câu, có CTA CardOn khi phù hợp',
    ],
    PROMOTION: [
      'Nêu ưu đãi + điều kiện + cách nhận trên CardOn; hạn chế filler marketing',
    ],
    NEWS: [
      'Tin ngắn, đủ 5W; liên hệ ảnh hưởng tới người mua thẻ trên CardOn',
    ],
  };

  const base = byType[contentType] ?? [
    'Nhấn mạnh góc độc đáo so với bài cũ; ưu tiên ví dụ và bước cụ thể trên CardOn',
    'Thân bài sâu hơn FAQ; FAQ tối đa 3 câu và không trùng H2',
  ];

  if (t.length < 6) return base;

  return [
    `Với chủ đề «${short}»: ${base[0]}`,
    ...base.slice(1),
  ].slice(0, 3);
}
