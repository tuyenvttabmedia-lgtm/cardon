import { esimDeliveryNotice } from '../../esim/esim-delivery.view';
import { ESIM_INSTALL_QR_CID } from '../../esim/esim-lpa-qr';
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

function renderEsimReadyEmail(
  locale: 'vi' | 'en',
  data: Record<string, unknown>,
): RenderedEmail {
  const orderCode = String(data.orderCode ?? '');
  const name = String(data.customerName ?? (locale === 'en' ? 'there' : 'Quý khách'));
  const accountUrl = String(data.accountUrl ?? '/tai-khoan/esim');
  const destination = String(data.destination ?? '').trim();
  const packageName = String(data.packageName ?? '').trim();
  const sharingLink = String(data.sharingLink ?? '').trim();
  const sharingAccessCode = String(data.sharingAccessCode ?? '').trim();
  const installSecret = String(data.installSecret ?? '').trim();
  const smdpAddress = String(data.smdpAddress ?? '').trim();
  const activationCode = String(data.activationCode ?? '').trim();
  const appleSetupUrl = String(data.appleSetupUrl ?? '').trim();
  const androidSetupUrl = String(data.androidSetupUrl ?? '').trim();
  const hasQrImage = data.hasQrImage === true;
  const guest = data.isGuestOrder === true;
  const planLine = [destination, packageName].filter(Boolean).join(' · ');
  const safeAccount = escapeHtml(accountUrl);
  const safeName = escapeHtml(name);
  const safeOrder = escapeHtml(orderCode);
  const safePlan = escapeHtml(planLine);
  const hasInstall = installSecret.startsWith('LPA:1$');

  if (locale === 'en') {
    const openLabel = guest ? 'Open your order page again' : 'Open your CardOn eSIM account';
    const cloudHtml =
      sharingLink.startsWith('https://') && sharingAccessCode
        ? `<p><strong>Track data &amp; validity without a CardOn account</strong></p>
<p>eSIM link: <a href="${escapeHtml(sharingLink)}">${escapeHtml(sharingLink)}</a><br/>Access code: <strong>${escapeHtml(sharingAccessCode)}</strong></p>
<p>Use this page to check remaining data and validity. Keep the access code private.</p>`
        : '';
    const cloudText =
      sharingLink.startsWith('https://') && sharingAccessCode
        ? `\nTrack data & validity (no CardOn account needed):\neSIM link: ${sharingLink}\nAccess code: ${sharingAccessCode}\n`
        : '';
    const accountNudgeHtml = guest
      ? `<p><strong>Tip:</strong> Create a free CardOn account with this same email to manage validity, remaining data, and top-ups under Account → eSIM.</p>`
      : '';
    const accountNudgeText = guest
      ? `\nTip: Create a free CardOn account with this same email to manage validity, remaining data, and top-ups under Account → eSIM.\n`
      : '';
    const qrHtml = hasInstall
      ? `<p><strong>Install QR</strong></p>
${hasQrImage ? `<p><img src="cid:${ESIM_INSTALL_QR_CID}" alt="eSIM install QR" width="220" height="220" style="display:block;border:0;max-width:220px;height:auto;" /></p>` : ''}
<p>Install code (LPA): <code style="word-break:break-all;">${escapeHtml(installSecret)}</code></p>
${smdpAddress && activationCode ? `<p>Manual entry — SM-DP+: <strong>${escapeHtml(smdpAddress)}</strong><br/>Activation code: <strong>${escapeHtml(activationCode)}</strong></p>` : ''}
${appleSetupUrl.startsWith('https://') ? `<p><a href="${escapeHtml(appleSetupUrl)}">Add eSIM on iPhone</a></p>` : ''}
${androidSetupUrl.startsWith('https://') ? `<p><a href="${escapeHtml(androidSetupUrl)}">Add eSIM on Android</a></p>` : ''}`
      : `<p>Open your order to reveal the install QR: <a href="${safeAccount}">${safeAccount}</a></p>`;
    const qrText = hasInstall
      ? `
Install code (LPA): ${installSecret}
${smdpAddress && activationCode ? `SM-DP+: ${smdpAddress}\nActivation code: ${activationCode}\n` : ''}${appleSetupUrl.startsWith('https://') ? `Add eSIM on iPhone: ${appleSetupUrl}\n` : ''}${androidSetupUrl.startsWith('https://') ? `Add eSIM on Android: ${androidSetupUrl}\n` : ''}`
      : `Open your order for the install QR: ${accountUrl}\n`;

    return {
      subject: `Your eSIM is ready — order ${orderCode}`,
      html: `<p>Hello ${safeName},</p>
<p>Your travel eSIM for order <strong>${safeOrder}</strong>${safePlan ? ` (${safePlan})` : ''} is ready on CardOn.</p>
${qrHtml}
<p><strong>Install on iPhone / iPad</strong></p>
<ol>
<li>Stay on Wi‑Fi.</li>
<li>Open Settings → Cellular → Add eSIM (or use <em>Add eSIM on iPhone</em> above).</li>
<li>Scan the QR in this email, or enter SM-DP+ / activation code manually.</li>
<li>Label the eSIM, then turn it on for mobile data when you arrive.</li>
</ol>
<p><strong>Install on Android</strong></p>
<ol>
<li>Stay on Wi‑Fi.</li>
<li>Open Settings → Network &amp; internet → SIMs → Add eSIM (or use <em>Add eSIM on Android</em> above).</li>
<li>Scan the QR, or paste the install code / SM-DP+ details.</li>
<li>Set this eSIM for data when you arrive.</li>
</ol>
${cloudHtml}
<p>${openLabel}: <a href="${safeAccount}">${safeAccount}</a></p>
${accountNudgeHtml}
<p>Do <strong>not</strong> forward this email. Keep the QR, install code, and access code private.</p>`,
      text: `Hello ${name},
Your travel eSIM for order ${orderCode}${planLine ? ` (${planLine})` : ''} is ready on CardOn.
${qrText}
iPhone: Wi-Fi → Settings → Cellular → Add eSIM → scan QR or enter SM-DP+ manually.
Android: Wi-Fi → Settings → Network & internet → SIMs → Add eSIM → scan QR or paste the code.
${cloudText}${openLabel}: ${accountUrl}
${accountNudgeText}Do not forward this email. Keep the QR, install code, and access code private.`,
    };
  }

  const openLabel = guest ? 'Mở lại trang đơn hàng' : 'Mở tài khoản eSIM CardOn';
  const cloudHtml =
    sharingLink.startsWith('https://') && sharingAccessCode
      ? `<p><strong>Theo dõi dung lượng &amp; thời hạn (không cần tài khoản CardOn)</strong></p>
<p>eSIM link: <a href="${escapeHtml(sharingLink)}">${escapeHtml(sharingLink)}</a><br/>Access code: <strong>${escapeHtml(sharingAccessCode)}</strong></p>
<p>Dùng trang này để xem dung lượng còn lại và thời hạn. Giữ access code riêng tư.</p>`
      : '';
  const cloudText =
    sharingLink.startsWith('https://') && sharingAccessCode
      ? `\nTheo dõi dung lượng & thời hạn (không cần tài khoản CardOn):\neSIM link: ${sharingLink}\nAccess code: ${sharingAccessCode}\n`
      : '';
  const accountNudgeHtml = guest
    ? `<p><strong>Gợi ý:</strong> Nên tạo tài khoản CardOn miễn phí bằng cùng email này để quản lý thời hạn, dung lượng còn lại và nạp thêm trong Tài khoản → eSIM.</p>`
    : '';
  const accountNudgeText = guest
    ? `\nGợi ý: Nên tạo tài khoản CardOn miễn phí bằng cùng email này để quản lý thời hạn, dung lượng còn lại và nạp thêm trong Tài khoản → eSIM.\n`
    : '';
  const qrHtml = hasInstall
    ? `<p><strong>Mã QR cài đặt</strong></p>
${hasQrImage ? `<p><img src="cid:${ESIM_INSTALL_QR_CID}" alt="QR cài eSIM" width="220" height="220" style="display:block;border:0;max-width:220px;height:auto;" /></p>` : ''}
<p>Mã cài (LPA): <code style="word-break:break-all;">${escapeHtml(installSecret)}</code></p>
${smdpAddress && activationCode ? `<p>Cài thủ công — SM-DP+: <strong>${escapeHtml(smdpAddress)}</strong><br/>Mã kích hoạt: <strong>${escapeHtml(activationCode)}</strong></p>` : ''}
${appleSetupUrl.startsWith('https://') ? `<p><a href="${escapeHtml(appleSetupUrl)}">Thêm eSIM trên iPhone</a></p>` : ''}
${androidSetupUrl.startsWith('https://') ? `<p><a href="${escapeHtml(androidSetupUrl)}">Thêm eSIM trên Android</a></p>` : ''}`
    : `<p>Mở trang đơn để lấy mã QR: <a href="${safeAccount}">${safeAccount}</a></p>`;
  const qrText = hasInstall
    ? `
Mã cài (LPA): ${installSecret}
${smdpAddress && activationCode ? `SM-DP+: ${smdpAddress}\nMã kích hoạt: ${activationCode}\n` : ''}${appleSetupUrl.startsWith('https://') ? `Thêm eSIM trên iPhone: ${appleSetupUrl}\n` : ''}${androidSetupUrl.startsWith('https://') ? `Thêm eSIM trên Android: ${androidSetupUrl}\n` : ''}`
    : `Mở trang đơn để lấy mã QR: ${accountUrl}\n`;

  return {
    subject: `Mã cài eSIM đã sẵn sàng — đơn ${orderCode}`,
    html: `<p>Xin chào ${safeName},</p>
<p>eSIM du lịch của đơn <strong>${safeOrder}</strong>${safePlan ? ` (${safePlan})` : ''} đã sẵn sàng trên CardOn.</p>
${qrHtml}
<p><strong>Cài trên iPhone / iPad</strong></p>
<ol>
<li>Giữ kết nối Wi‑Fi.</li>
<li>Vào Cài đặt → Di động → Thêm eSIM (hoặc bấm <em>Thêm eSIM trên iPhone</em> ở trên).</li>
<li>Quét mã QR trong email này, hoặc nhập SM-DP+ / mã kích hoạt thủ công.</li>
<li>Đặt nhãn cho eSIM, rồi bật dữ liệu di động khi đến nơi.</li>
</ol>
<p><strong>Cài trên Android</strong></p>
<ol>
<li>Giữ kết nối Wi‑Fi.</li>
<li>Vào Cài đặt → Mạng và internet → SIM → Thêm eSIM (hoặc bấm <em>Thêm eSIM trên Android</em> ở trên).</li>
<li>Quét mã QR, hoặc dán mã cài / nhập SM-DP+.</li>
<li>Đặt eSIM này làm SIM dữ liệu khi đến nơi.</li>
</ol>
${cloudHtml}
<p>${openLabel}: <a href="${safeAccount}">${safeAccount}</a></p>
${accountNudgeHtml}
<p><strong>Không</strong> chuyển tiếp email này. Giữ mã QR / mã cài / access code riêng tư.</p>`,
    text: `Xin chào ${name},
eSIM du lịch đơn ${orderCode}${planLine ? ` (${planLine})` : ''} đã sẵn sàng trên CardOn.
${qrText}
iPhone: Wi-Fi → Cài đặt → Di động → Thêm eSIM → quét QR hoặc nhập SM-DP+ thủ công.
Android: Wi-Fi → Cài đặt → Mạng và internet → SIM → Thêm eSIM → quét QR hoặc dán mã cài.
${cloudText}${openLabel}: ${accountUrl}
${accountNudgeText}Không chuyển tiếp email này. Giữ mã QR / mã cài / access code riêng tư.`,
  };
}

function renderEnglishEmail(
  template: EmailTemplateType,
  data: Record<string, unknown>,
): RenderedEmail | null {
  switch (template) {
    case 'USER_REGISTER': {
      const name = escapeHtml(String(data.fullName ?? 'there'));
      const verifyUrl = String(data.verifyUrl ?? '').trim();
      if (verifyUrl) {
        return {
          subject: 'Welcome to CardOn.vn — verify your email',
          html: `<p>Hello ${name},</p><p>Thanks for creating a CardOn partner account.</p><p><a href="${escapeHtml(verifyUrl)}">Verify your email</a></p>`,
          text: `Welcome to CardOn.vn. Verify your email: ${verifyUrl}`,
        };
      }
      return {
        subject: 'Welcome to CardOn.vn',
        html: `<p>Hello ${name},</p><p>Your CardOn.vn account is ready. Sign in with this email to buy cards, top up, and track orders.</p>`,
        text: `Welcome to CardOn.vn. Your account is ready — sign in with this email to buy cards and track orders.`,
      };
    }
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
      return renderEsimReadyEmail('en', data);
    case 'ESIM_LOW_DATA':
      return {
        subject: `Low data on your eSIM — order ${String(data.orderCode ?? '')}`,
        html: `<p>Your eSIM for order ${escapeHtml(String(data.orderCode ?? ''))} is running low on data${data.remaining ? ` (about ${escapeHtml(String(data.remaining))} left)` : ''}.</p><p><a href="${escapeHtml(String(data.accountUrl ?? '/tai-khoan/esim'))}">Open your account to top up</a></p>`,
        text: `Low data on eSIM order ${String(data.orderCode ?? '')}. Top up in your account: ${String(data.accountUrl ?? '/tai-khoan/esim')}`,
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
      const verifyUrl = String(data.verifyUrl ?? '').trim();
      if (verifyUrl) {
        return {
          subject: 'Xác minh tài khoản đối tác CardOn.vn',
          html: `<p>Xin chào ${greeting},</p><p>Cảm ơn bạn đã đăng ký tài khoản đối tác CardOn.vn.</p><p>Vui lòng xác minh email: <a href="${escapeHtml(verifyUrl)}">Xác minh tài khoản</a></p>`,
          text: `Xin chào ${name || 'bạn'},\nCảm ơn bạn đã đăng ký đối tác CardOn.vn.\nXác minh email: ${verifyUrl}`,
        };
      }
      return {
        subject: 'Chào mừng đến với CardOn.vn',
        html: `<p>Xin chào ${greeting},</p><p>Tài khoản CardOn.vn của bạn đã sẵn sàng. Đăng nhập bằng email này để mua thẻ, nạp cước và theo dõi đơn hàng.</p>`,
        text: `Xin chào ${name || 'bạn'},\nTài khoản CardOn.vn đã sẵn sàng. Đăng nhập bằng email này để mua thẻ và theo dõi đơn hàng.`,
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
    case 'ESIM_READY':
      return renderEsimReadyEmail('vi', data);
    case 'ESIM_LOW_DATA': {
      const accountUrl = escapeHtml(String(data.accountUrl ?? '/tai-khoan/esim'));
      const remaining =
        data.remaining != null && String(data.remaining).trim()
          ? ` (còn khoảng ${escapeHtml(String(data.remaining))})`
          : '';
      return {
        subject: `eSIM sắp hết data — đơn ${String(data.orderCode ?? '')}`,
        html: `<p>Xin chào ${escapeHtml(String(data.customerName ?? 'Quý khách'))},</p><p>eSIM của đơn <strong>${escapeHtml(String(data.orderCode ?? ''))}</strong> đang sắp hết data${remaining}.</p><p>Mở tài khoản để xem gói top-up: <a href="${accountUrl}">${accountUrl}</a></p>`,
        text: `eSIM đơn ${String(data.orderCode ?? '')} sắp hết data. Top-up trong tài khoản: ${String(data.accountUrl ?? '/tai-khoan/esim')}`,
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
