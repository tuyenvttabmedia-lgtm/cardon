export const ESIM_SALES_OFF_COPY = 'Chưa mở bán';

export function EsimSalesOffNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role="status"
      className={
        compact
          ? 'rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950'
          : 'rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950'
      }
    >
      <p className="font-semibold">{ESIM_SALES_OFF_COPY}</p>
      <p className="mt-1 leading-relaxed">
        Bạn có thể xem điểm đến và gói. Chưa đặt mua hoặc thanh toán eSIM.
      </p>
    </div>
  );
}
