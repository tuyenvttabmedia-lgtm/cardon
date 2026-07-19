import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export function Hero() {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-orange-500 px-6 py-16 text-white md:px-12 md:py-20">
      <div className="relative z-10 max-w-2xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-brand-100">
          Thẻ game & nạp tiền tức thì
        </p>
        <h1 className="text-4xl font-bold leading-tight md:text-5xl">
          Mua thẻ nhanh — nhận mã an toàn trên CardOn
        </h1>
        <p className="mt-4 text-lg text-brand-50">
          Thanh toán QR ngân hàng hoặc chuyển khoản trực tuyến. Giao thẻ tự động sau khi thanh toán thành công.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/cards">
            <Button size="lg" className="bg-white text-brand-700 hover:bg-brand-50">
              Mua ngay
            </Button>
          </Link>
          <Link href="/cards?type=topup">
            <Button size="lg" variant="secondary" className="border-white/30 bg-white/10 text-white hover:bg-white/20">
              Nạp điện thoại
            </Button>
          </Link>
        </div>
      </div>
      <div className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
    </section>
  );
}
