export type CustomerNotificationGroup = 'order' | 'pin' | 'promo' | 'system';

export function inferCustomerNotificationGroup(type: string, title: string): CustomerNotificationGroup {
  const text = `${type} ${title}`.toLowerCase();
  if (text.includes('pin') || text.includes('thẻ') || text.includes('card') || text.includes('mã')) {
    return 'pin';
  }
  if (
    text.includes('order') ||
    text.includes('đơn') ||
    text.includes('thanh toán') ||
    text.includes('payment')
  ) {
    return 'order';
  }
  if (text.includes('promo') || text.includes('khuyến') || text.includes('voucher')) {
    return 'promo';
  }
  return 'system';
}
