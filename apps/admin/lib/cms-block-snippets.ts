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
  | 'gioi-thieu-full';

export const CMS_BLOCK_SNIPPET_LABELS: Record<CmsBlockSnippetKey, { label: string; desc: string }> = {
  section: { label: 'Khối nội dung', desc: 'Tiêu đề + đoạn văn trong card' },
  'mission-grid': { label: '3 card Sứ mệnh', desc: 'Lưới 3 cột icon + tiêu đề' },
  stats: { label: 'Banner thống kê', desc: '4 số liệu nổi bật' },
  features: { label: '4 lý do chọn', desc: 'Lưới 2 cột feature card' },
  cta: { label: 'Nút CTA', desc: 'Hai nút hành động' },
  'gioi-thieu-full': { label: 'Mẫu Giới thiệu đầy đủ', desc: 'Toàn bộ layout như trang cũ' },
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
    <p class="cms-block-card-desc">Trở thành nền tảng phân phối thẻ số và nạp cước hàng đầu.</p>
  </div>
  <div class="cms-block-card">
    <span class="cms-block-card-icon">🤝</span>
    <p class="cms-block-card-title">Giá trị</p>
    <p class="cms-block-card-desc">Minh bạch, nhanh chóng và luôn đặt khách hàng lên hàng đầu.</p>
  </div>
</div>`,
  stats: `<div class="cms-block-stats">
  <div class="cms-block-stat">
    <p class="cms-block-stat-value">50K+</p>
    <p class="cms-block-stat-label">Khách hàng</p>
  </div>
  <div class="cms-block-stat">
    <p class="cms-block-stat-value">200K+</p>
    <p class="cms-block-stat-label">Đơn hàng</p>
  </div>
  <div class="cms-block-stat">
    <p class="cms-block-stat-value">99.9%</p>
    <p class="cms-block-stat-label">Uptime</p>
  </div>
  <div class="cms-block-stat">
    <p class="cms-block-stat-value">24/7</p>
    <p class="cms-block-stat-label">Hỗ trợ</p>
  </div>
</div>`,
  features: `<h2>Vì sao chọn CardOn?</h2>
<div class="cms-block-grid-2">
  <div class="cms-block-feature">
    <span class="cms-block-feature-icon">⚡</span>
    <div class="cms-block-feature-body">
      <p class="cms-block-feature-title">Giao dịch tức thì</p>
      <p class="cms-block-feature-desc">Nhận mã thẻ ngay sau thanh toán, nạp cước tự động 24/7.</p>
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
      <p class="cms-block-feature-title">Giá tốt nhất</p>
      <p class="cms-block-feature-desc">Chiết khấu hấp dẫn, không phí ẩn, minh bạch từng giao dịch.</p>
    </div>
  </div>
  <div class="cms-block-feature">
    <span class="cms-block-feature-icon">🎧</span>
    <div class="cms-block-feature-body">
      <p class="cms-block-feature-title">Hỗ trợ tận tâm</p>
      <p class="cms-block-feature-desc">Đội ngũ CSKH luôn sẵn sàng qua email, hotline và Zalo.</p>
    </div>
  </div>
</div>`,
  cta: `<div class="cms-block-cta">
  <a href="/" class="cms-block-btn cms-block-btn-primary">Mua thẻ ngay</a>
  <a href="/lien-he" class="cms-block-btn cms-block-btn-secondary">Liên hệ chúng tôi</a>
</div>`,
  'gioi-thieu-full': `<div class="cms-block-section">
  <h2>CardOn là gì?</h2>
  <p>CardOn.vn là nền tảng thương mại điện tử chuyên cung cấp thẻ game, thẻ điện thoại và dịch vụ nạp cước trực tuyến. Chúng tôi kết nối trực tiếp với các nhà cung cấp uy tín, đảm bảo giao mã nhanh chóng và hỗ trợ khách hàng 24/7.</p>
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
    <p class="cms-block-card-desc">Trở thành nền tảng phân phối thẻ số và nạp cước hàng đầu.</p>
  </div>
  <div class="cms-block-card">
    <span class="cms-block-card-icon">🤝</span>
    <p class="cms-block-card-title">Giá trị</p>
    <p class="cms-block-card-desc">Minh bạch, nhanh chóng và luôn đặt khách hàng lên hàng đầu.</p>
  </div>
</div>
<div class="cms-block-stats">
  <div class="cms-block-stat">
    <p class="cms-block-stat-value">50K+</p>
    <p class="cms-block-stat-label">Khách hàng</p>
  </div>
  <div class="cms-block-stat">
    <p class="cms-block-stat-value">200K+</p>
    <p class="cms-block-stat-label">Đơn hàng</p>
  </div>
  <div class="cms-block-stat">
    <p class="cms-block-stat-value">99.9%</p>
    <p class="cms-block-stat-label">Uptime</p>
  </div>
  <div class="cms-block-stat">
    <p class="cms-block-stat-value">24/7</p>
    <p class="cms-block-stat-label">Hỗ trợ</p>
  </div>
</div>
<h2>Vì sao chọn CardOn?</h2>
<div class="cms-block-grid-2">
  <div class="cms-block-feature">
    <span class="cms-block-feature-icon">⚡</span>
    <div class="cms-block-feature-body">
      <p class="cms-block-feature-title">Giao dịch tức thì</p>
      <p class="cms-block-feature-desc">Nhận mã thẻ ngay sau thanh toán, nạp cước tự động 24/7.</p>
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
      <p class="cms-block-feature-title">Giá tốt nhất</p>
      <p class="cms-block-feature-desc">Chiết khấu hấp dẫn, không phí ẩn, minh bạch từng giao dịch.</p>
    </div>
  </div>
  <div class="cms-block-feature">
    <span class="cms-block-feature-icon">🎧</span>
    <div class="cms-block-feature-body">
      <p class="cms-block-feature-title">Hỗ trợ tận tâm</p>
      <p class="cms-block-feature-desc">Đội ngũ CSKH luôn sẵn sàng qua email, hotline và Zalo.</p>
    </div>
  </div>
</div>
<div class="cms-block-cta">
  <a href="/" class="cms-block-btn cms-block-btn-primary">Mua thẻ ngay</a>
  <a href="/lien-he" class="cms-block-btn cms-block-btn-secondary">Liên hệ chúng tôi</a>
</div>`,
};

export const GIOI_THIEU_LANDING_HTML = CMS_BLOCK_SNIPPETS['gioi-thieu-full'];
