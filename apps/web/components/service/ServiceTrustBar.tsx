import { cn } from '@/lib/utils';

const TRUST_ITEMS = [
  {
    icon: '⚡',
    title: 'Giao mã tức thì',
    description: 'Nhận thẻ ngay sau thanh toán',
  },
  {
    icon: '🔒',
    title: 'Thanh toán an toàn',
    description: 'QR ngân hàng & chuyển khoản bảo mật',
  },
  {
    icon: '🎧',
    title: 'Hỗ trợ 24/7',
    description: 'Luôn sẵn sàng hỗ trợ bạn',
  },
] as const;

export function ServiceTrustBar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 md:grid md:grid-cols-3 md:gap-4',
        className,
      )}
      aria-label="Cam kết dịch vụ"
    >
      {TRUST_ITEMS.map((item) => (
        <div
          key={item.title}
          className={cn(
            'flex items-center gap-2.5 rounded-xl border border-cardon-border bg-white p-2.5 shadow-card transition-all duration-200 md:gap-3 md:rounded-2xl md:p-4',
            'md:hover:-translate-y-0.5 md:hover:border-blue-100 md:hover:shadow-md',
          )}
        >
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-base md:text-lg"
            aria-hidden
          >
            {item.icon}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-cardon-navy md:text-base">{item.title}</p>
            <p className="hidden text-xs text-cardon-gray md:mt-0.5 md:block">{item.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
