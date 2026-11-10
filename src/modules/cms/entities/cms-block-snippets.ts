/** Whitelisted layout block classes for CMS landing pages. */
export const CMS_BLOCK_CLASSES = [
  'cms-block-section',
  'cms-block-intro',
  'cms-block-grid-3',
  'cms-block-grid-2',
  'cms-block-card',
  'cms-block-card-icon',
  'cms-block-card-title',
  'cms-block-card-desc',
  'cms-block-stats',
  'cms-block-stat',
  'cms-block-stat-value',
  'cms-block-stat-label',
  'cms-block-feature',
  'cms-block-feature-icon',
  'cms-block-feature-body',
  'cms-block-feature-title',
  'cms-block-feature-desc',
  'cms-block-cta',
  'cms-block-btn',
  'cms-block-btn-primary',
  'cms-block-btn-secondary',
] as const;

export type CmsBlockSnippetKey =
  | 'section'
  | 'mission-grid'
  | 'stats'
  | 'features'
  | 'cta'
  | 'gioi-thieu-full'
  | 'lien-he-intro';

export const CMS_BLOCK_SNIPPET_LABELS: Record<CmsBlockSnippetKey, { label: string; desc: string }> = {
  section: { label: 'Khối nội dung', desc: 'Tiêu đề + đoạn văn trong card' },
  'mission-grid': { label: '3 card Sứ mệnh', desc: 'Lưới 3 cột icon + tiêu đề' },
  stats: { label: 'Cam kết vận hành', desc: '4 điểm tin cậy (không dùng số liệu marketing ảo)' },
  features: { label: '4 lý do chọn', desc: 'Lưới 2 cột feature card' },
  cta: { label: 'Nút CTA', desc: 'Hai nút hành động' },
  'gioi-thieu-full': { label: 'Mẫu Giới thiệu đầy đủ', desc: 'Layout phù hợp công bố minh bạch' },
  'lien-he-intro': {
    label: 'Mẫu Liên hệ (intro)',
    desc: 'Đoạn mở + mẹo liên hệ — form/kênh/map vẫn lấy từ trang Liên hệ',
  },
};

export const CMS_BLOCK_SNIPPETS: Record<CmsBlockSnippetKey, string> = {
  section: `<div class="cms-block-section">
  <h2>Tiêu đề khối</h2>
  <p>Nội dung mô tả ngắn gọn cho khối này.</p>
</div>`,
  'mission-grid': `<div class="cms-block-grid-3">
  <div class="cms-block-card">
    <span class="cms-block-card-icon">🎯</span>
    <p class="cms-block-card-title">Sứ mệnh</p>
    <p class="cms-block-card-desc">Mang dịch vụ số đến gần hơn với mọi người dùng Việt Nam.</p>
  </div>
  <div class="cms-block-card">
    <span class="cms-block-card-icon">💡</span>
    <p class="cms-block-card-title">Tầm nhìn</p>
    <p class="cms-block-card-desc">Xây dựng nền tảng phân phối thẻ số và nạp cước tin cậy, dễ tiếp cận.</p>
  </div>
  <div class="cms-block-card">
    <span class="cms-block-card-icon">🤝</span>
    <p class="cms-block-card-title">Giá trị</p>
    <p class="cms-block-card-desc">Minh bạch, nhanh chóng và luôn đặt khách hàng lên hàng đầu.</p>
  </div>
</div>`,
  stats: `<div class="cms-block-stats">
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
</div>`,
  features: `<h2>Vì sao chọn CardOn?</h2>
<div class="cms-block-grid-2">
  <div class="cms-block-feature">
    <span class="cms-block-feature-icon">⚡</span>
    <div class="cms-block-feature-body">
      <p class="cms-block-feature-title">Giao dịch tức thì</p>
      <p class="cms-block-feature-desc">Nhận mã thẻ ngay sau thanh toán, nạp cước tự động.</p>
    </div>
  </div>
  <div class="cms-block-feature">
    <span class="cms-block-feature-icon">🔒</span>
    <div class="cms-block-feature-body">
      <p class="cms-block-feature-title">An toàn bảo mật</p>
      <p class="cms-block-feature-desc">Thanh toán QR ngân hàng, mã hóa dữ liệu đa lớp.</p>
    </div>
  </div>
  <div class="cms-block-feature">
    <span class="cms-block-feature-icon">💰</span>
    <div class="cms-block-feature-body">
      <p class="cms-block-feature-title">Giá rõ ràng</p>
      <p class="cms-block-feature-desc">Chiết khấu hiển thị trước khi thanh toán, không phí ẩn.</p>
    </div>
  </div>
  <div class="cms-block-feature">
    <span class="cms-block-feature-icon">🎧</span>
    <div class="cms-block-feature-body">
      <p class="cms-block-feature-title">Hỗ trợ tận tâm</p>
      <p class="cms-block-feature-desc">Đội ngũ CSKH sẵn sàng qua email, hotline và Zalo.</p>
    </div>
  </div>
</div>`,
  cta: `<div class="cms-block-cta">
  <a href="/" class="cms-block-btn cms-block-btn-primary">Mua thẻ ngay</a>
  <a href="/lien-he" class="cms-block-btn cms-block-btn-secondary">Liên hệ chúng tôi</a>
</div>`,
  'gioi-thieu-full': `<div class="cms-block-section">
  <h2>CardOn là gì?</h2>
  <p>CardOn.vn là nền tảng thương mại điện tử chuyên cung cấp thẻ game, thẻ điện thoại và dịch vụ nạp cước trực tuyến. Chúng tôi kết nối với các nhà cung cấp uy tín, giao mã sau thanh toán và hỗ trợ khách hàng qua các kênh công khai trên website.</p>
</div>
<div class="cms-block-grid-3">
  <div class="cms-block-card">
    <span class="cms-block-card-icon">🎯</span>
    <p class="cms-block-card-title">Sứ mệnh</p>
    <p class="cms-block-card-desc">Mang dịch vụ số đến gần hơn với mọi người dùng Việt Nam.</p>
  </div>
  <div class="cms-block-card">
    <span class="cms-block-card-icon">💡</span>
    <p class="cms-block-card-title">Tầm nhìn</p>
    <p class="cms-block-card-desc">Xây dựng nền tảng phân phối thẻ số và nạp cước tin cậy, dễ tiếp cận.</p>
  </div>
  <div class="cms-block-card">
    <span class="cms-block-card-icon">🤝</span>
    <p class="cms-block-card-title">Giá trị</p>
    <p class="cms-block-card-desc">Minh bạch, nhanh chóng và luôn đặt khách hàng lên hàng đầu.</p>
  </div>
</div>
<div class="cms-block-stats">
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
</div>
<div class="cms-block-section">
  <h2>Thông tin doanh nghiệp</h2>
  <p>Tên công ty, mã số thuế, địa chỉ trụ sở, email và thời gian làm việc được công bố tại chân trang website và trang Liên hệ — đúng thông tin đã đăng ký kinh doanh.</p>
</div>
<h2>Vì sao chọn CardOn?</h2>
<div class="cms-block-grid-2">
  <div class="cms-block-feature">
    <span class="cms-block-feature-icon">⚡</span>
    <div class="cms-block-feature-body">
      <p class="cms-block-feature-title">Giao dịch tức thì</p>
      <p class="cms-block-feature-desc">Nhận mã thẻ ngay sau thanh toán, nạp cước tự động.</p>
    </div>
  </div>
  <div class="cms-block-feature">
    <span class="cms-block-feature-icon">🔒</span>
    <div class="cms-block-feature-body">
      <p class="cms-block-feature-title">An toàn bảo mật</p>
      <p class="cms-block-feature-desc">Thanh toán QR ngân hàng, mã hóa dữ liệu đa lớp.</p>
    </div>
  </div>
  <div class="cms-block-feature">
    <span class="cms-block-feature-icon">💰</span>
    <div class="cms-block-feature-body">
      <p class="cms-block-feature-title">Giá rõ ràng</p>
      <p class="cms-block-feature-desc">Chiết khấu hiển thị trước khi thanh toán, không phí ẩn.</p>
    </div>
  </div>
  <div class="cms-block-feature">
    <span class="cms-block-feature-icon">🎧</span>
    <div class="cms-block-feature-body">
      <p class="cms-block-feature-title">Hỗ trợ tận tâm</p>
      <p class="cms-block-feature-desc">Đội ngũ CSKH sẵn sàng qua email, hotline và Zalo.</p>
    </div>
  </div>
</div>
<div class="cms-block-cta">
  <a href="/" class="cms-block-btn cms-block-btn-primary">Mua thẻ ngay</a>
  <a href="/lien-he" class="cms-block-btn cms-block-btn-secondary">Liên hệ chúng tôi</a>
</div>`,
  'lien-he-intro': `<div class="cms-block-section">
  <h2>Liên hệ CardOn</h2>
  <p>Chúng tôi luôn sẵn sàng hỗ trợ bạn về mua thẻ, nạp cước, thanh toán và tra cứu đơn hàng. Dùng form bên dưới hoặc các kênh hotline / email / Zalo — thông tin doanh nghiệp và bản đồ lấy từ cấu hình Giao diện.</p>
</div>
<div class="cms-block-grid-3">
  <div class="cms-block-card">
    <span class="cms-block-card-icon">⏱️</span>
    <p class="cms-block-card-title">Phản hồi nhanh</p>
    <p class="cms-block-card-desc">Tin nhắn trong giờ làm việc thường được xử lý trong vài giờ. Ngoài giờ hãy để lại email hoặc Zalo.</p>
  </div>
  <div class="cms-block-card">
    <span class="cms-block-card-icon">📋</span>
    <p class="cms-block-card-title">Khi liên hệ nên kèm</p>
    <p class="cms-block-card-desc">Mã đơn hàng (nếu có), số điện thoại / email đã dùng thanh toán, và mô tả ngắn vấn đề cần hỗ trợ.</p>
  </div>
  <div class="cms-block-card">
    <span class="cms-block-card-icon">🛟</span>
    <p class="cms-block-card-title">Trung tâm trợ giúp</p>
    <p class="cms-block-card-desc">Xem FAQ trước khi gửi tin — nhiều câu hỏi về mua thẻ, nạp cước và thanh toán đã có sẵn.</p>
  </div>
</div>
<div class="cms-block-cta">
  <a href="/tro-giup" class="cms-block-btn cms-block-btn-primary">Xem câu hỏi thường gặp</a>
  <a href="/tra-cuu-don-hang" class="cms-block-btn cms-block-btn-secondary">Tra cứu đơn hàng</a>
</div>`,
};

export const GIOI_THIEU_LANDING_HTML = CMS_BLOCK_SNIPPETS['gioi-thieu-full'];
export const LIEN_HE_INTRO_HTML = CMS_BLOCK_SNIPPETS['lien-he-intro'];

/** English seed for Contact CMS intro (publish via tab Tiếng Anh). */
export const LIEN_HE_INTRO_HTML_EN = `<div class="cms-block-section">
  <h2>Contact CardOn</h2>
  <p>We are here to help with buying cards, top-up, payments and order lookup. Use the form below or hotline / email / Zalo — company details and the map come from Appearance settings.</p>
</div>
<div class="cms-block-grid-3">
  <div class="cms-block-card">
    <span class="cms-block-card-icon">⏱️</span>
    <p class="cms-block-card-title">Quick reply</p>
    <p class="cms-block-card-desc">Messages during working hours are usually handled within a few hours. After hours, leave an email or Zalo and we will get back to you.</p>
  </div>
  <div class="cms-block-card">
    <span class="cms-block-card-icon">📋</span>
    <p class="cms-block-card-title">Include with your message</p>
    <p class="cms-block-card-desc">Order code if you have one, the phone or email used to pay, and a short description of the issue.</p>
  </div>
  <div class="cms-block-card">
    <span class="cms-block-card-icon">🛟</span>
    <p class="cms-block-card-title">Help center</p>
    <p class="cms-block-card-desc">Check FAQs first — many questions about cards, top-up and payments already have answers.</p>
  </div>
</div>
<div class="cms-block-cta">
  <a href="/en/tro-giup" class="cms-block-btn cms-block-btn-primary">View FAQs</a>
  <a href="/en/tra-cuu-don-hang" class="cms-block-btn cms-block-btn-secondary">Order lookup</a>
</div>`;
