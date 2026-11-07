import type { Locale } from './locale';
import { finalEn, finalVi } from './final-messages';
import { journeyEn, journeyVi } from './journey-messages';

const coreVi = {
  'lang.vi': 'Tiếng Việt',
  'lang.en': 'English',
  'lang.switch': 'Ngôn ngữ',
  'nav.login': 'Đăng nhập',
  'nav.register': 'Đăng ký',
  'nav.search': 'Tìm kiếm',
  'nav.logout': 'Đăng xuất',
  'account.profile': 'Thông tin tài khoản',
  'account.orders': 'Lịch sử giao dịch',
  'account.cards': 'Mã thẻ đã mua',
  'account.esim': 'eSIM',
  'account.topups': 'Nạp cước',
  'account.data': 'Nạp Data',
  'account.password': 'Bảo mật',
  'market.vnOnly': 'Sản phẩm này chỉ bán tại Việt Nam.',
  'esim.salesOffTitle': 'Tạm dừng bán eSIM',
  'esim.salesOffBody': 'Bạn vẫn xem được điểm đến và gói. Thanh toán sẽ mở lại sớm.',
  'auth.loginTitle': 'Đăng nhập',
  'auth.loginHint': 'Đăng nhập để tiếp tục',
  'auth.loginSubtitle': 'Truy cập tài khoản CardOn để mua thẻ và theo dõi đơn hàng',
  'auth.noAccount': 'Chưa có tài khoản?',
  'auth.identifier': 'Email hoặc tên đăng nhập',
  'auth.password': 'Mật khẩu',
  'auth.submitLogin': 'Đăng nhập',
  'auth.loggingIn': 'Đang đăng nhập...',
  'auth.loginFailed': 'Đăng nhập thất bại',
  'auth.resetOk': 'Mật khẩu đã được cập nhật. Vui lòng đăng nhập.',
  'auth.forgot': 'Quên mật khẩu?',
  'auth.heroTitle': 'Mua thẻ & nạp cước online nhanh chóng',
  'auth.heroBody': 'Hệ thống phân phối mã thẻ tự động, an toàn 24/7',
  'auth.feature1Title': 'Nhận mã thẻ tức thì',
  'auth.feature1Body': 'Giao tự động sau thanh toán',
  'auth.feature2Title': 'Thanh toán QR an toàn',
  'auth.feature2Body': 'Chuyển khoản & QR bảo mật',
  'auth.feature3Title': 'Quản lý lịch sử giao dịch',
  'auth.feature3Body': 'Tra cứu đơn hàng mọi lúc',
  'trust.instant': 'Giao mã tức thì',
  'trust.instantBody': 'Nhận thẻ ngay sau thanh toán',
  'trust.pay': 'Thanh toán an toàn',
  'trust.payBody': 'QR ngân hàng & chuyển khoản bảo mật',
  'trust.support': 'Hỗ trợ 24/7',
  'trust.supportBody': 'Luôn sẵn sàng hỗ trợ bạn',
  'trust.brand': 'Uy tín CardOn',
  'trust.brandBody': 'Nền tảng phân phối số 1',
  'product.loading': 'Đang tải sản phẩm...',
  'product.missing': 'Không tìm thấy sản phẩm.',
  'product.denom': 'Chọn mệnh giá',
  'product.qty': 'Số lượng',
  'product.subtotal': 'Tổng tạm tính',
  'product.buy': 'Mua ngay',
  'checkout.pay': 'Thanh toán',
  'checkout.processing': 'Đang xử lý...',
  'checkout.createPay': 'Tạo đơn & thanh toán',
  'footer.cmsNote': 'Nội dung trang chính sách giữ nguyên bản đã xuất bản.',
} as const;

const vi = { ...coreVi, ...journeyVi, ...finalVi } as const;

const coreEn: Record<keyof typeof coreVi, string> = {
  'lang.vi': 'Tiếng Việt',
  'lang.en': 'English',
  'lang.switch': 'Language',
  'nav.login': 'Log in',
  'nav.register': 'Sign up',
  'nav.search': 'Search',
  'nav.logout': 'Log out',
  'account.profile': 'Account',
  'account.orders': 'Orders',
  'account.cards': 'Purchased codes',
  'account.esim': 'eSIM',
  'account.topups': 'Top-up',
  'account.data': 'Data',
  'account.password': 'Security',
  'market.vnOnly': 'This product is only sold in Vietnam.',
  'esim.salesOffTitle': 'eSIM sales paused',
  'esim.salesOffBody': 'You can still browse destinations and plans. Checkout will reopen soon.',
  'auth.loginTitle': 'Log in',
  'auth.loginHint': 'Log in to continue',
  'auth.loginSubtitle': 'Use your CardOn account to buy cards and track orders',
  'auth.noAccount': 'No account yet?',
  'auth.identifier': 'Email or username',
  'auth.password': 'Password',
  'auth.submitLogin': 'Log in',
  'auth.loggingIn': 'Signing in...',
  'auth.loginFailed': 'Sign-in failed',
  'auth.resetOk': 'Password updated. Please log in.',
  'auth.forgot': 'Forgot password?',
  'auth.heroTitle': 'Buy cards and top up online',
  'auth.heroBody': 'Automatic digital delivery, around the clock',
  'auth.feature1Title': 'Codes delivered instantly',
  'auth.feature1Body': 'Sent automatically after payment',
  'auth.feature2Title': 'Secure QR payment',
  'auth.feature2Body': 'Bank transfer and QR',
  'auth.feature3Title': 'Order history',
  'auth.feature3Body': 'Look up orders any time',
  'trust.instant': 'Instant delivery',
  'trust.instantBody': 'Codes arrive after payment',
  'trust.pay': 'Secure payment',
  'trust.payBody': 'Bank QR and transfer',
  'trust.support': 'Support 24/7',
  'trust.supportBody': 'We are here to help',
  'trust.brand': 'CardOn',
  'trust.brandBody': 'Digital product distribution',
  'product.loading': 'Loading product...',
  'product.missing': 'Product not found.',
  'product.denom': 'Choose an amount',
  'product.qty': 'Quantity',
  'product.subtotal': 'Subtotal',
  'product.buy': 'Buy now',
  'checkout.pay': 'Pay',
  'checkout.processing': 'Processing...',
  'checkout.createPay': 'Create order and pay',
  'footer.cmsNote': 'Policy pages stay in their published language.',
};

const en: Record<keyof typeof vi, string> = { ...coreEn, ...journeyEn, ...finalEn };

export const englishMessages: Record<MessageKey, string> = en;

export type MessageKey = keyof typeof vi;

export function translate(locale: Locale, key: MessageKey): string {
  const catalog = locale === 'en' ? en : vi;
  const value = catalog[key];
  if (typeof value === 'string' && value.trim()) return value;
  const fallback = vi[key];
  if (typeof fallback === 'string' && fallback.trim()) return fallback;
  return key;
}

export function isMessageKey(value: string | null | undefined): value is MessageKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(vi, value);
}
