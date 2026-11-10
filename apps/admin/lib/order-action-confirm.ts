/** Copy builders for retail order action confirmation modals (D2-A1). */

export type OrderActionConfirmKind =
  | 'retry'
  | 'resend_email'
  | 'switch_provider'
  | 'mark_fulfilled'
  | 'refund';

export type OrderActionConfirmCopy = {
  kind: OrderActionConfirmKind;
  title: string;
  confirmLabel: string;
  /** Stronger visual for financial / irreversible status changes. */
  danger: boolean;
  lines: string[];
};

export function buildOrderActionConfirmCopy(input: {
  kind: OrderActionConfirmKind;
  orderCode: string;
  paymentStatus?: string | null;
  fulfillmentStatus?: string | null;
  /** Customer destination email when known — never invent. */
  customerEmail?: string | null;
  /** Order total when present — never invent a refund amount. */
  orderTotalLabel?: string | null;
  retryLabel: string;
}): OrderActionConfirmCopy {
  const statusLine = [
    input.paymentStatus ? `Thanh toán: ${input.paymentStatus}` : null,
    input.fulfillmentStatus ? `Giao hàng: ${input.fulfillmentStatus}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const base = [`Mã đơn: ${input.orderCode}`, statusLine || null].filter(Boolean) as string[];

  switch (input.kind) {
    case 'retry':
      return {
        kind: 'retry',
        title: `Xác nhận: ${input.retryLabel}`,
        confirmLabel: `Xác nhận ${input.retryLabel}`,
        danger: false,
        lines: [
          ...base,
          `Thao tác «${input.retryLabel}» sẽ gửi lại yêu cầu fulfillment cho đơn này.`,
          'Chỉ tiếp tục sau khi đã đối chiếu thanh toán nếu nghi ngờ tiền chưa về cổng.',
        ],
      };
    case 'resend_email':
      return {
        kind: 'resend_email',
        title: 'Xác nhận: Gửi lại email',
        confirmLabel: 'Xác nhận gửi lại email',
        danger: false,
        lines: [
          ...base,
          input.customerEmail
            ? `Email sẽ được gửi lại tới: ${input.customerEmail}`
            : 'Email sẽ được gửi lại tới địa chỉ khách trên đơn (nếu hệ thống có).',
          'Hủy sẽ không gửi email.',
        ],
      };
    case 'switch_provider':
      return {
        kind: 'switch_provider',
        title: 'Xác nhận: Đổi nhà cung cấp',
        confirmLabel: 'Xác nhận đổi NCC',
        danger: true,
        lines: [
          ...base,
          'Thao tác recovery «Đổi NCC» có thể chuyển đơn sang nhà cung cấp khác theo quy trình hiện tại.',
          'Không dùng nếu đơn đã giao thành công.',
        ],
      };
    case 'mark_fulfilled':
      return {
        kind: 'mark_fulfilled',
        title: 'Xác nhận: Đánh dấu hoàn tất',
        confirmLabel: 'Xác nhận đánh dấu hoàn tất',
        danger: true,
        lines: [
          ...base,
          'Thao tác recovery sẽ đánh dấu đơn đã giao xong trên hệ thống.',
          'Chỉ dùng khi đã xác minh khách đã nhận hàng ngoài hệ thống.',
        ],
      };
    case 'refund':
      return {
        kind: 'refund',
        title: 'Xác nhận: Hoàn tiền (recovery)',
        confirmLabel: 'Xác nhận hoàn tiền',
        danger: true,
        lines: [
          ...base,
          input.orderTotalLabel
            ? `Số tiền trên đơn (tham chiếu, không tự tính hoàn): ${input.orderTotalLabel}`
            : 'Số tiền hoàn theo quy trình recovery hiện tại — không tự tính thêm trên giao diện.',
          'Đây là thao tác tài chính / recovery. Hủy sẽ không gọi API.',
        ],
      };
  }
}
