import type { Locale } from './locale';
import { translate, type MessageKey } from './messages';
import { ApiClientError } from '@/services/api-client';

const VI_MESSAGE_KEYS: Record<string, MessageKey> = {
  'Sản phẩm này chỉ bán tại Việt Nam.': 'market.vnOnly',
  'Chưa mở bán': 'error.salesOff',
  'Tạm dừng bán eSIM': 'error.salesOff',
  'Đơn vượt giới hạn thanh toán eSIM. Vui lòng chọn gói có giá trị thấp hơn hoặc liên hệ bộ phận hỗ trợ.':
    'error.esimOrderAmountLimit',
  'Đăng nhập trước khi mua eSIM': 'checkout.esimLogin',
  'Vui lòng nhập email để nhận đơn hàng': 'checkout.emailRequired',
  'Thanh toán thất bại': 'checkout.payFailed',
  'Thanh toán tạm thời chưa khả dụng. Thử lại sau hoặc liên hệ hỗ trợ.': 'checkout.unavailable',
  'Hiện chưa có phương thức thanh toán khả dụng': 'checkout.noMethods',
  'Không tạo được mã QR thanh toán. Thử lại hoặc liên hệ hỗ trợ.': 'error.noQr',
  'Không tạo được thanh toán eSIM': 'error.esimPay',
  'Không tải được phương thức thanh toán': 'error.noPayMethods',
  'Yêu cầu thất bại': 'error.failed',
  'Không tải được thông tin tài khoản': 'account.loadFail',
  'Lỗi cập nhật': 'account.saveFail',
  'Đổi mật khẩu thất bại': 'account.passwordFail',
  'Không tìm thấy đơn hàng': 'order.notFound',
  'Không tải được đơn hàng': 'order.loadFail',
  'Không thể hiển thị mã': 'order.cannotShow',
  'Không kiểm tra được trạng thái đơn': 'pay.statusFail',
  'Không tải được danh sách gói eSIM.': 'esim.loadFail',
  'Không kết nối được máy chủ. Thử lại sau.': 'error.offline',
};

const CODE_KEYS: Record<string, MessageKey> = {
  UNAUTHORIZED: 'error.unauthorized',
  FORBIDDEN: 'error.edgeBlocked',
  EDGE_BLOCKED: 'error.edgeBlocked',
  NOT_FOUND: 'error.notFound',
  BAD_REQUEST: 'error.generic',
  VALIDATION_ERROR: 'error.generic',
  EMAIL_NOT_VERIFIED: 'auth.emailNotVerified',
  ACCOUNT_SUSPENDED: 'auth.accountSuspended',
  ESIM_ORDER_AMOUNT_LIMIT: 'error.esimOrderAmountLimit',
  TOO_MANY_REQUESTS: 'error.rateLimited',
};

function hasVietnamese(value: string): boolean {
  return /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(value);
}

function failedRequestKey(raw: string): MessageKey | null {
  const match = raw.match(/^Yêu cầu thất bại(?: \((\d+)\))?$/);
  if (!match) return null;
  const status = match[1] ? Number(match[1]) : 0;
  return statusKey(status) ?? 'error.failed';
}

function statusKey(status: number): MessageKey | null {
  // 401 only — 403 is often Cloudflare Managed Challenge on public POSTs, not session expiry.
  if (status === 401) return 'error.unauthorized';
  if (status === 403) return 'error.edgeBlocked';
  if (status === 429) return 'error.rateLimited';
  if (status === 404) return 'error.notFound';
  if (status >= 500) return 'error.unavailable';
  return null;
}

export function customerFacingError(locale: Locale, error: unknown): string {
  const raw = error instanceof Error ? error.message : '';
  const mapped = raw ? VI_MESSAGE_KEYS[raw] ?? failedRequestKey(raw) ?? undefined : undefined;
  if (locale !== 'en') {
    if (mapped) return translate('vi', mapped);
    if (raw) return raw;
    return translate('vi', 'error.generic');
  }

  if (error instanceof ApiClientError) {
    const byCode = error.code ? CODE_KEYS[error.code] : undefined;
    if (byCode) return translate('en', byCode);
    if (mapped) return translate('en', mapped);
    const byStatus = statusKey(error.status);
    if (byStatus && (hasVietnamese(raw) || !raw)) return translate('en', byStatus);
    if (hasVietnamese(raw)) {
      console.error('Unmapped customer API error', { status: error.status, code: error.code });
      return translate('en', 'error.generic');
    }
    return raw || translate('en', 'error.generic');
  }

  if (mapped) return translate('en', mapped);
  if (raw && hasVietnamese(raw)) return translate('en', 'error.generic');
  return raw || translate('en', 'error.generic');
}
