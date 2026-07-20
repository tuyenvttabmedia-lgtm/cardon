export function paymentStatusLabelVi(status: string): string {
  const map: Record<string, string> = {
    WAITING_PAYMENT: 'Chờ thanh toán',
    PAID: 'Đã thanh toán',
    FAILED: 'Thanh toán thất bại',
    EXPIRED: 'Đã hết hạn',
    REFUNDED: 'Đã hoàn tiền',
  };
  return map[status] ?? status;
}

export function fulfillmentStatusLabelVi(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'Chờ xử lý',
    PROCESSING: 'Đang giao thẻ',
    COMPLETED: 'Hoàn thành',
    FAILED: 'Thất bại',
    WAITING_ADMIN_RETRY: 'Đang xử lý',
    NEED_MANUAL_REVIEW: 'Cần hỗ trợ',
  };
  return map[status] ?? status;
}

export function customerOrderStatusLabelVi(status: string): string {
  const map: Record<string, string> = {
    WAITING_PAYMENT: 'Chờ thanh toán',
    PAID: 'Đã thanh toán',
    PROCESSING_PROVIDER: 'Đang xử lý',
    DELIVERED: 'Hoàn thành',
    NEED_SUPPORT: 'Cần hỗ trợ',
  };
  return map[status] ?? status;
}

export function resolveCustomerOrderStatusLabel(order: {
  customerStatusLabel?: string;
  customerStatus?: string;
  paymentStatus: string;
  fulfillmentStatus: string;
}): string {
  if (order.customerStatusLabel) return order.customerStatusLabel;
  if (order.customerStatus) return customerOrderStatusLabelVi(order.customerStatus);
  if (order.paymentStatus === 'WAITING_PAYMENT') return customerOrderStatusLabelVi('WAITING_PAYMENT');
  if (order.fulfillmentStatus === 'COMPLETED') return customerOrderStatusLabelVi('DELIVERED');
  if (order.fulfillmentStatus === 'WAITING_ADMIN_RETRY') {
    return customerOrderStatusLabelVi('PROCESSING_PROVIDER');
  }
  if (
    order.fulfillmentStatus === 'NEED_MANUAL_REVIEW' ||
    order.fulfillmentStatus === 'FAILED'
  ) {
    return customerOrderStatusLabelVi('NEED_SUPPORT');
  }
  if (order.paymentStatus === 'PAID' && (order.fulfillmentStatus === 'PROCESSING' || order.fulfillmentStatus === 'PENDING')) {
    return customerOrderStatusLabelVi('PROCESSING_PROVIDER');
  }
  return fulfillmentStatusLabelVi(order.fulfillmentStatus);
}
