import { esimDeliveryNotice } from '../../esim/esim-delivery.view';
import { EmailTemplateType } from '../entities/notification.constants';
import { formatCardDeliveryEmailBlocks } from './card-delivery-email.format';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function emailLocale(data: Record<string, unknown>): 'vi' | 'en' {
  return data.locale === 'en' ? 'en' : 'vi';
}

function renderEnglishEmail(
  template: EmailTemplateType,
  data: Record<string, unknown>,
): RenderedEmail | null {
  switch (template) {
    case 'USER_REGISTER':
      return {
        subject: 'Welcome to CardOn.vn',
        html: `<p>Hello ${escapeHtml(String(data.fullName ?? 'there'))},</p><p>Thanks for creating a CardOn.vn account.</p><p><a href="${escapeHtml(String(data.verifyUrl ?? ''))}">Verify your email</a></p>`,
        text: `Welcome to CardOn.vn. Verify your email: ${String(data.verifyUrl ?? '')}`,
      };
    case 'PASSWORD_RESET':
      return {
        subject: 'Reset your CardOn.vn password',
        html: `<p>We received a password reset request.</p><p><a href="${escapeHtml(String(data.resetUrl ?? ''))}">Reset password</a></p><p>This link expires in 1 hour.</p>`,
        text: `Reset your CardOn password: ${String(data.resetUrl ?? '')}\nThe link expires in 1 hour.`,
      };
    case 'PAYMENT_SUCCESS':
      return {
        subject: `Payment received — order ${String(data.orderCode ?? '')}`,
        html: `<p>Hello ${escapeHtml(String(data.customerName ?? 'there'))},</p><p>We received ${escapeHtml(String(data.amount ?? data.total ?? ''))} VND for order ${escapeHtml(String(data.orderCode ?? ''))}.</p>`,
        text: `Payment received for order ${String(data.orderCode ?? '')}. Amount: ${String(data.total ?? data.amount ?? '')} VND`,
      };
    case 'ESIM_READY':
      return {
        subject: `Your eSIM is ready — order ${String(data.orderCode ?? '')}`,
        html: `<p>Your eSIM for order ${escapeHtml(String(data.orderCode ?? ''))} is ready.</p><p><a href="${escapeHtml(String(data.accountUrl ?? '/tai-khoan/esim'))}">Open install instructions</a></p><p>This email does not include the install code.</p>`,
        text: `eSIM for order ${String(data.orderCode ?? '')} is ready. Open your account. This email does not include the install code.`,
      };
    case 'ORDER_SUCCESS':
      return {
        subject: `Order ${String(data.orderCode ?? '')} confirmed`,
        html: `<p>Your order <strong>${escapeHtml(String(data.orderCode ?? ''))}</strong> has been confirmed.</p><p>Total: ${escapeHtml(String(data.totalAmount ?? ''))} VND</p>`,
        text: `Order ${String(data.orderCode ?? '')} confirmed. Total: ${String(data.totalAmount ?? '')} VND`,
      };
    case 'CARD_DELIVERED':
    case 'CARD_DELIVERY': {
      const cards = Array.isArray(data.cards)
        ? (data.cards as Array<{ serial?: string; pin?: string }>)
        : [];
      const blocks =
        typeof data.cardsHtml === 'string' && typeof data.cardsText === 'string'
          ? { cardsHtml: data.cardsHtml, cardsText: data.cardsText }
          : formatCardDeliveryEmailBlocks(
              cards.map((card) => ({
                serial: String(card.serial ?? ''),
                pin: String(card.pin ?? ''),
              })),
            );
      return {
        subject: `Your codes — order ${String(data.orderCode ?? '')}`,
        html: `<p>Hello ${escapeHtml(String(data.customerName ?? 'there'))},</p><p>Order <strong>${escapeHtml(String(data.orderCode ?? ''))}</strong> is complete.</p><p>Product: ${escapeHtml(String(data.items ?? ''))}</p>${blocks.cardsHtml}`,
        text: `Hello ${String(data.customerName ?? 'there')},\nOrder ${String(data.orderCode ?? '')} is complete.\nProduct: ${String(data.items ?? '')}\n\n${blocks.cardsText}`,
      };
    }
    case 'TOPUP_SUCCESS':
      return {
        subject: `Top-up completed — order ${String(data.orderCode ?? '')}`,
        html: `<p>Hello ${escapeHtml(String(data.customerName ?? 'there'))},</p><p>The carrier confirmed top-up order ${escapeHtml(String(data.orderCode ?? ''))}.</p>`,
        text: `Top-up completed — order ${String(data.orderCode ?? '')}`,
      };
    case 'DATA_SUCCESS':
      return {
        subject: `Data pack completed — order ${String(data.orderCode ?? '')}`,
        html: `<p>Hello ${escapeHtml(String(data.customerName ?? 'there'))},</p><p>The carrier confirmed data order ${escapeHtml(String(data.orderCode ?? ''))}.</p>`,
        text: `Data pack completed — order ${String(data.orderCode ?? '')}`,
      };
    case 'ESIM_TEST_READY':
      return {
        subject: `Simulated eSIM stored — order ${String(data.orderCode ?? '')}`,
        html: `<p>The internal simulated eSIM for order ${escapeHtml(String(data.orderCode ?? ''))} was stored.</p><p>Do not install it on a real phone. This email has no install code.</p>`,
        text: `Simulated eSIM for order ${String(data.orderCode ?? '')} was stored. Do not install it. No install code in this email.`,
      };
    case 'ESIM_SANDBOX_READY':
      return {
        subject: `[TEST] eSIM install code ready — order ${String(data.orderCode ?? '')}`,
        html: `<p>Hello ${escapeHtml(String(data.customerName ?? 'there'))},</p><p>The test eSIM for order <strong>${escapeHtml(String(data.orderCode ?? ''))}</strong> is ready in your CardOn account.</p><p>This is a test code, not a real eSIM. This email has no install code.</p>`,
        text: `[TEST] eSIM for order ${String(data.orderCode ?? '')} is ready in your account. Test code only. No install code in this email.`,
      };
    default:
      return null;
  }
}

export function renderEmailTemplate(
  template: EmailTemplateType,
  data: Record<string, unknown>,
): RenderedEmail {
  if (emailLocale(data) === 'en') {
    const english = renderEnglishEmail(template, data);
    if (english) return english;
  }
  switch (template) {
    case 'USER_REGISTER': {
      const name = String(data.fullName ?? '').trim();
      const greeting = name ? escapeHtml(name) : 'bạn';
      return {
        subject: 'Chào mừng đến với CardOn.vn',
        html: `<p>Xin chào ${greeting},</p><p>Cảm ơn bạn đã đăng ký tài khoản CardOn.vn.</p><p>Vui lòng xác minh email: <a href="${escapeHtml(String(data.verifyUrl ?? ''))}">Xác minh tài khoản</a></p>`,
        text: `Xin chào ${name || 'bạn'},\nCảm ơn bạn đã đăng ký CardOn.vn.\nXác minh email: ${String(data.verifyUrl ?? '')}`,
      };
    }
    case 'PASSWORD_RESET':
      return {
        subject: 'Đặt lại mật khẩu CardOn.vn',
        html: `<p>Bạn vừa yêu cầu đặt lại mật khẩu.</p><p><a href="${escapeHtml(String(data.resetUrl ?? ''))}">Đặt lại mật khẩu</a></p><p>Liên kết hết hạn sau 1 giờ. Nếu không phải bạn, hãy bỏ qua email này.</p>`,
        text: `Đặt lại mật khẩu CardOn: ${String(data.resetUrl ?? '')}\nLiên kết hết hạn sau 1 giờ.`,
      };
    case 'ORDER_SUCCESS':
      return {
        subject: `Order ${String(data.orderCode ?? '')} confirmed`,
        html: `<p>Your order <strong>${escapeHtml(String(data.orderCode ?? ''))}</strong> has been confirmed.</p><p>Total: ${escapeHtml(String(data.totalAmount ?? ''))} VND</p>`,
        text: `Order ${String(data.orderCode ?? '')} confirmed. Total: ${String(data.totalAmount ?? '')} VND`,
      };
    case 'PAYMENT_SUCCESS':
      return {
        subject: `Thanh toán thành công — đơn ${String(data.orderCode ?? '')}`,
        html: `<p>Xin chào ${escapeHtml(String(data.customerName ?? 'Quý khách'))},</p><p>Thanh toán ${escapeHtml(String(data.amount ?? data.total ?? ''))} VND đã được ghi nhận cho đơn ${escapeHtml(String(data.orderCode ?? ''))}.</p><p>Sản phẩm: ${escapeHtml(String(data.items ?? ''))}</p>`,
        text: `Thanh toán thành công đơn ${String(data.orderCode ?? '')}. Tổng: ${String(data.total ?? data.amount ?? '')} VND`,
      };
    case 'CARD_DELIVERED':
    case 'CARD_DELIVERY': {
      const cards = Array.isArray(data.cards)
        ? (data.cards as Array<{ serial?: string; pin?: string }>)
        : [];
      const blocks =
        typeof data.cardsHtml === 'string' && typeof data.cardsText === 'string'
          ? { cardsHtml: data.cardsHtml, cardsText: data.cardsText }
          : formatCardDeliveryEmailBlocks(
              cards.map((card) => ({
                serial: String(card.serial ?? ''),
                pin: String(card.pin ?? ''),
              })),
            );

      return {
        subject: `Thẻ của bạn — đơn ${String(data.orderCode ?? '')}`,
        html: `<p>Xin chào ${escapeHtml(String(data.customerName ?? 'Quý khách'))},</p><p>Đơn hàng <strong>${escapeHtml(String(data.orderCode ?? ''))}</strong> đã hoàn tất.</p><p>Sản phẩm: ${escapeHtml(String(data.items ?? ''))}</p>${blocks.cardsHtml}`,
        text: `Xin chào ${String(data.customerName ?? 'Quý khách')},\nĐơn ${String(data.orderCode ?? '')} đã hoàn tất.\nSản phẩm: ${String(data.items ?? '')}\n\n${blocks.cardsText}`,
      };
    }
    case 'TOPUP_SUCCESS':
      return {
        subject: `Nạp cước thành công — đơn ${String(data.orderCode ?? '')}`,
        html: `<p>Xin chào ${escapeHtml(String(data.customerName ?? 'Quý khách'))},</p><p>Đơn nạp cước ${escapeHtml(String(data.orderCode ?? ''))} đã được nhà mạng xác nhận.</p>`,
        text: `Nạp cước thành công — đơn ${String(data.orderCode ?? '')}`,
      };
    case 'DATA_SUCCESS':
      return {
        subject: `Nạp data thành công — đơn ${String(data.orderCode ?? '')}`,
        html: `<p>Xin chào ${escapeHtml(String(data.customerName ?? 'Quý khách'))},</p><p>Đơn nạp data ${escapeHtml(String(data.orderCode ?? ''))} đã được nhà mạng xác nhận.</p>`,
        text: `Nạp data thành công — đơn ${String(data.orderCode ?? '')}`,
      };
    case 'ESIM_TEST_READY':
      return {
        subject: `eSIM mô phỏng đã lưu — đơn ${String(data.orderCode ?? '')}`,
        html: `<p>Hồ sơ eSIM mô phỏng nội bộ của đơn ${escapeHtml(String(data.orderCode ?? ''))} đã được lưu.</p><p>Không cài lên thiết bị thật. Xem trong tài khoản. Email này không chứa mã cài đặt.</p>`,
        text: `Hồ sơ eSIM mô phỏng nội bộ của đơn ${String(data.orderCode ?? '')} đã lưu. Không cài lên thiết bị thật. Xem trong tài khoản. Không có mã cài đặt trong email.`,
      };
    case 'ESIM_SANDBOX_READY': {
      const sandboxAccountUrl = escapeHtml(String(data.accountUrl ?? '/tai-khoan/esim'));
      const sandboxNotice = esimDeliveryNotice('ready', false, true) ?? '';
      return {
        subject: `[TEST] Mã cài eSIM đã sẵn sàng — đơn ${String(data.orderCode ?? '')}`,
        html: `<p>Xin chào ${escapeHtml(String(data.customerName ?? 'Quý khách'))},</p><p>Mã cài eSIM của đơn <strong>${escapeHtml(String(data.orderCode ?? ''))}</strong> đã sẵn sàng trên CardOn.</p><p>${escapeHtml(sandboxNotice)}</p><p>Mở tài khoản CardOn để xem mã cài và hướng dẫn: <a href="${sandboxAccountUrl}">${sandboxAccountUrl}</a></p><p>Email này không chứa mã cài đặt.</p>`,
        text: `[TEST] Mã cài eSIM đơn ${String(data.orderCode ?? '')} đã sẵn sàng trên CardOn. ${sandboxNotice} Xem trong tài khoản: ${String(data.accountUrl ?? '/tai-khoan/esim')}. Không có mã cài đặt trong email.`,
      };
    }
    case 'ESIM_READY': {
      const accountUrl = escapeHtml(String(data.accountUrl ?? '/tai-khoan/esim'));
      return {
        subject: `Mã cài eSIM đã sẵn sàng — đơn ${String(data.orderCode ?? '')}`,
        html: `<p>Xin chào ${escapeHtml(String(data.customerName ?? 'Quý khách'))},</p><p>Mã cài eSIM của đơn <strong>${escapeHtml(String(data.orderCode ?? ''))}</strong> đã sẵn sàng.</p><p>Mở tài khoản CardOn để xem mã QR và hướng dẫn cài: <a href="${accountUrl}">${accountUrl}</a></p><p>Email này không chứa mã cài đặt.</p>`,
        text: `Mã cài eSIM đơn ${String(data.orderCode ?? '')} đã sẵn sàng. Xem trong tài khoản: ${String(data.accountUrl ?? '/tai-khoan/esim')}. Không có mã cài đặt trong email.`,
      };
    }
    case 'AGENT_APPROVED': {
      const loginUrl = escapeHtml(String(data.partnerLoginUrl ?? ''));
      return {
        subject: 'KYC đại lý CardOn đã được duyệt',
        html: `<p>Tài khoản đại lý <strong>${escapeHtml(String(data.companyName ?? ''))}</strong> đã được duyệt.</p><p>Đăng nhập Partner Portal để xem API key và bắt đầu tích hợp: <a href="${loginUrl}">${loginUrl}</a></p>`,
        text: `KYC đại lý ${String(data.companyName ?? '')} đã duyệt. Đăng nhập: ${String(data.partnerLoginUrl ?? '')}`,
      };
    }
    case 'AGENT_KYC_REJECTED':
      return {
        subject: 'Hồ sơ KYC đại lý bị từ chối',
        html: `<p>Hồ sơ KYC của <strong>${escapeHtml(String(data.companyName ?? ''))}</strong> đã bị từ chối.</p><p>Lý do: ${escapeHtml(String(data.reason ?? ''))}</p><p>Vui lòng cập nhật và nộp lại: <a href="${escapeHtml(String(data.kycUrl ?? ''))}">Mở KYC</a></p>`,
        text: `KYC bị từ chối — ${String(data.companyName ?? '')}. Lý do: ${String(data.reason ?? '')}. Cập nhật tại ${String(data.kycUrl ?? '')}`,
      };
    case 'AGENT_KYC_NEED_MORE_INFO':
      return {
        subject: 'CardOn yêu cầu bổ sung hồ sơ KYC',
        html: `<p>CardOn cần thêm thông tin cho hồ sơ KYC của <strong>${escapeHtml(String(data.companyName ?? ''))}</strong>.</p><p>${escapeHtml(String(data.reason ?? ''))}</p>${data.fields ? `<p>Trường cần bổ sung: ${escapeHtml(String(data.fields))}</p>` : ''}<p><a href="${escapeHtml(String(data.kycUrl ?? ''))}">Cập nhật KYC</a></p>`,
        text: `Bổ sung KYC — ${String(data.companyName ?? '')}. ${String(data.reason ?? '')}. ${String(data.kycUrl ?? '')}`,
      };
    case 'AGENT_LOW_BALANCE':
      return {
        subject: 'CardOn Agent — low balance alert',
        html: `<p>Available balance is ${escapeHtml(String(data.availableBalance ?? ''))} VND (threshold ${escapeHtml(String(data.threshold ?? ''))} VND).</p>`,
        text: `Low balance: ${String(data.availableBalance ?? '')} VND`,
      };
    case 'AGENT_API_DISABLED':
      return {
        subject: 'CardOn Agent API disabled',
        html: `<p>API access for <strong>${escapeHtml(String(data.companyName ?? ''))}</strong> has been disabled by an administrator.</p>`,
        text: `Agent API disabled for ${String(data.companyName ?? '')}`,
      };
    case 'PROVIDER_LOW_BALANCE':
      return {
        subject: `Số dư NCC thấp: ${String(data.providerName ?? data.providerCode ?? '')}`,
        html: `<p>NCC <strong>${escapeHtml(String(data.providerName ?? ''))}</strong> còn ${escapeHtml(String(data.balance ?? ''))} VND (ngưỡng ${escapeHtml(String(data.threshold ?? ''))} VND).</p><p>Cần nạp ví trước khi giao đơn mới.</p>`,
        text: `Số dư NCC thấp: ${String(data.providerName ?? data.providerCode ?? '')} — ${String(data.balance ?? '')} VND (ngưỡng ${String(data.threshold ?? '')} VND)`,
      };
    case 'CONTACT_FORM':
      return {
        subject: `[Liên hệ] ${String(data.subject ?? 'Tin nhắn mới')}`,
        html: `<p><strong>${escapeHtml(String(data.name ?? ''))}</strong> (${escapeHtml(String(data.email ?? ''))})</p>
<p>SĐT: ${escapeHtml(String(data.phone ?? '—'))}</p>
<p>Chủ đề: ${escapeHtml(String(data.subject ?? ''))}</p>
<p>${escapeHtml(String(data.message ?? '')).replace(/\n/g, '<br>')}</p>`,
        text: `Liên hệ từ ${String(data.name ?? '')} <${String(data.email ?? '')}>\nSĐT: ${String(data.phone ?? '')}\nChủ đề: ${String(data.subject ?? '')}\n\n${String(data.message ?? '')}`,
      };
    default:
      return {
        subject: 'CardOn notification',
        html: '<p>You have a new notification from CardOn.</p>',
        text: 'You have a new notification from CardOn.',
      };
  }
}
