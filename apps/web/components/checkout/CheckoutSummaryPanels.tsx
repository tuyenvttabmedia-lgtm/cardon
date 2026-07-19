'use client';

import {
  PaymentMethodPicker,
  PaymentMethodsEmpty,
} from '@/components/checkout/PaymentPanel';
import { CustomerPriceBreakdown } from '@/components/checkout/CustomerPriceBreakdown';
import { OrderAmountLimitAlert } from '@/components/checkout/OrderAmountLimitAlert';
import { formatVnd } from '@/lib/utils';
import type { OrderAmountLimitDetails } from '@/lib/order-limit';
import type { CustomerPriceView } from '@/lib/customer-price';
import type { PublicPaymentMethod } from '@/lib/payment-methods';
import type { Product, ProductVariant } from '@/types/api';

export function CardOrderSummaryPanel({
  product,
  variant,
  quantity,
  pricing,
  paymentMethods,
  paymentMethodCode,
  onPaymentMethodChange,
  hasPaymentMethods,
  loading,
  error,
  orderLimitError,
  onPay,
  payButtonLabel,
  disabled,
  isOverOrderLimit = false,
}: {
  product: Product | null;
  variant: ProductVariant | null;
  quantity: number;
  pricing: CustomerPriceView | null;
  paymentMethods: PublicPaymentMethod[];
  paymentMethodCode: string | null;
  onPaymentMethodChange: (code: string) => void;
  hasPaymentMethods: boolean;
  loading: boolean;
  error: string | null;
  orderLimitError?: OrderAmountLimitDetails | null;
  onPay: () => void;
  payButtonLabel: string;
  disabled: boolean;
  isOverOrderLimit?: boolean;
}) {
  return (
    <div className="sticky top-[88px] rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
      <h3 className="text-lg font-bold text-cardon-navy">Tóm tắt đơn hàng</h3>
      <div className="mt-4">
        <div className="mb-3 flex justify-between text-sm">
          <span className="text-cardon-gray">Loại thẻ</span>
          <span className="font-medium">{product?.name ?? '—'}</span>
        </div>
        <CustomerPriceBreakdown pricing={pricing} quantity={quantity} showQuantity />
      </div>

      <p className="mt-5 text-sm font-semibold text-cardon-navy">Phương thức thanh toán</p>
      <div className="mt-2">
        {hasPaymentMethods && paymentMethodCode ? (
          <PaymentMethodPicker methods={paymentMethods} value={paymentMethodCode} onChange={onPaymentMethodChange} />
        ) : (
          <PaymentMethodsEmpty />
        )}
      </div>

      <button
        type="button"
        className="btn-checkout mt-5"
        disabled={disabled || loading || (!isOverOrderLimit && (!hasPaymentMethods || !paymentMethodCode))}
        onClick={() => void onPay()}
      >
        {payButtonLabel}
        {!loading && pricing && !isOverOrderLimit ? ` ${formatVnd(pricing.totalPayment)}` : ''}
      </button>
      {orderLimitError ? (
        <div className="mt-2">
          <OrderAmountLimitAlert details={orderLimitError} />
        </div>
      ) : null}
      {!orderLimitError && error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

export function TelcoOrderSummaryPanel({
  carrierLabel: carrierName,
  phone,
  variant,
  pricing,
  paymentMethods,
  paymentMethodCode,
  onPaymentMethodChange,
  hasPaymentMethods,
  loading,
  error,
  orderLimitError,
  onPay,
  payButtonLabel,
  disabled,
  packageLabel,
  isOverOrderLimit = false,
}: {
  carrierLabel?: string;
  phone: string;
  variant: ProductVariant | null;
  pricing: CustomerPriceView | null;
  paymentMethods: PublicPaymentMethod[];
  paymentMethodCode: string | null;
  onPaymentMethodChange: (code: string) => void;
  hasPaymentMethods: boolean;
  loading: boolean;
  error: string | null;
  orderLimitError?: OrderAmountLimitDetails | null;
  onPay: () => void;
  payButtonLabel: string;
  disabled: boolean;
  packageLabel?: string;
  isOverOrderLimit?: boolean;
}) {
  return (
    <div className="sticky top-[88px] rounded-2xl border border-cardon-border bg-white p-5 shadow-card">
      <h3 className="text-lg font-bold text-cardon-navy">Thông tin giao dịch</h3>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-cardon-gray">Nhà mạng</dt>
          <dd className="text-right font-medium">{carrierName ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-cardon-gray">SĐT</dt>
          <dd className="text-right font-medium">{phone || '—'}</dd>
        </div>
        {packageLabel && (
          <div className="flex justify-between gap-4">
            <dt className="text-cardon-gray">Gói data</dt>
            <dd className="text-right font-medium">{packageLabel}</dd>
          </div>
        )}
      </dl>
      <div className="mt-4">
        <CustomerPriceBreakdown pricing={pricing} />
      </div>

      <p className="mt-5 text-sm font-semibold text-cardon-navy">Phương thức thanh toán</p>
      <div className="mt-2">
        {hasPaymentMethods && paymentMethodCode ? (
          <PaymentMethodPicker methods={paymentMethods} value={paymentMethodCode} onChange={onPaymentMethodChange} />
        ) : (
          <PaymentMethodsEmpty />
        )}
      </div>

      <button
        type="button"
        className="btn-checkout mt-5"
        disabled={disabled || loading || (!isOverOrderLimit && (!hasPaymentMethods || !paymentMethodCode))}
        onClick={() => void onPay()}
      >
        {payButtonLabel}
        {!loading && pricing && !isOverOrderLimit ? ` ${formatVnd(pricing.totalPayment)}` : ''}
      </button>
      {orderLimitError ? (
        <div className="mt-2">
          <OrderAmountLimitAlert details={orderLimitError} />
        </div>
      ) : null}
      {!orderLimitError && error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

/** @deprecated use TelcoOrderSummaryPanel */
export const TopupSummaryPanel = TelcoOrderSummaryPanel;
