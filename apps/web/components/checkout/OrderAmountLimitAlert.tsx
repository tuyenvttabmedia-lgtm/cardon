import { formatVndPlain, type OrderAmountLimitDetails } from '@/lib/order-limit';

export function OrderAmountLimitAlert({ details }: { details: OrderAmountLimitDetails }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
      <p className="font-semibold">Đơn hàng vượt quá giới hạn cho phép.</p>
      <p className="mt-2">
        Giới hạn tối đa mỗi đơn:{' '}
        <strong>{formatVndPlain(details.limit)}</strong>
      </p>
      <p className="mt-1">
        Giá trị đơn hàng hiện tại:{' '}
        <strong>{formatVndPlain(details.current)}</strong>
      </p>
      <p className="mt-2 text-red-800">
        Vui lòng giảm số lượng sản phẩm hoặc chia thành nhiều đơn hàng.
      </p>
    </div>
  );
}

export function buildOrderLimitPreview(
  limit: number,
  current: number,
): OrderAmountLimitDetails {
  return { limit, current };
}
