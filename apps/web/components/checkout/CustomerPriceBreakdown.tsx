'use client';

import { formatVnd } from '@/lib/utils';
import type { CustomerPriceView } from '@/lib/customer-price';

export function CustomerPriceBreakdown({
  pricing,
  quantity = 1,
  showQuantity = false,
}: {
  pricing: CustomerPriceView | null;
  quantity?: number;
  showQuantity?: boolean;
}) {
  if (!pricing) {
    return null;
  }

  const showDiscount = pricing.discountAmount > 0;
  const showPaymentFee = pricing.paymentFee > 0;

  return (
    <dl className="space-y-2 text-sm">
      {showQuantity && quantity > 1 && (
        <div className="flex justify-between gap-4">
          <dt className="text-cardon-gray">Số lượng</dt>
          <dd className="font-medium">{quantity}</dd>
        </div>
      )}
      <div className="flex justify-between gap-4">
        <dt className="text-cardon-gray">Mệnh giá</dt>
        <dd className="font-medium">{formatVnd(pricing.faceValue)}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-cardon-gray">Giá bán</dt>
        <dd className="font-medium">{formatVnd(pricing.sellPrice)}</dd>
      </div>
      {showDiscount && (
        <div className="flex justify-between gap-4">
          <dt className="text-cardon-gray">Giảm giá</dt>
          <dd className="font-medium text-cardon-green">−{formatVnd(pricing.discountAmount)}</dd>
        </div>
      )}
      {showPaymentFee && (
        <div className="flex justify-between gap-4">
          <dt className="text-cardon-gray">Phí thanh toán</dt>
          <dd className="font-medium">+{formatVnd(pricing.paymentFee)}</dd>
        </div>
      )}
      <div className="flex justify-between gap-4 border-t border-gray-100 pt-3 text-base">
        <dt className="font-bold">Tổng thanh toán</dt>
        <dd className="font-bold text-cardon-danger">{formatVnd(pricing.totalPayment)}</dd>
      </div>
    </dl>
  );
}
