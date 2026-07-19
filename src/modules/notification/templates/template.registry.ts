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

export function renderEmailTemplate(
  template: EmailTemplateType,
  data: Record<string, unknown>,
): RenderedEmail {
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
        subject: `Provider low balance: ${String(data.providerCode ?? '')}`,
        html: `<p>Provider ${escapeHtml(String(data.providerName ?? ''))} balance is ${escapeHtml(String(data.balance ?? ''))} VND.</p>`,
        text: `Provider ${String(data.providerCode ?? '')} low balance ${String(data.balance ?? '')}`,
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
