'use client';

import Link from 'next/link';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHero } from '@/components/layout/PageHero';

const MISSION_CARDS = [
  { icon: '🎯', title: 'Sứ mệnh', desc: 'Mang dịch vụ số đến gần hơn với mọi người dùng Việt Nam.' },
  { icon: '💡', title: 'Tầm nhìn', desc: 'Trở thành nền tảng phân phối thẻ số và nạp cước hàng đầu.' },
  { icon: '🤝', title: 'Giá trị', desc: 'Minh bạch, nhanh chóng và luôn đặt khách hàng lên hàng đầu.' },
];

const STATS = [
  { value: '50K+', label: 'Khách hàng' },
  { value: '200K+', label: 'Đơn hàng' },
  { value: '99.9%', label: 'Uptime' },
  { value: '24/7', label: 'Hỗ trợ' },
];

const WHY_CHOOSE = [
  { icon: '⚡', title: 'Giao dịch tức thì', desc: 'Nhận mã thẻ ngay sau thanh toán, nạp cước tự động 24/7.' },
  { icon: '🔒', title: 'An toàn bảo mật', desc: 'Thanh toán QR ngân hàng, mã hóa dữ liệu đa lớp.' },
  { icon: '💰', title: 'Giá tốt nhất', desc: 'Chiết khấu hấp dẫn, không phí ẩn, minh bạch từng giao dịch.' },
  { icon: '🎧', title: 'Hỗ trợ tận tâm', desc: 'Đội ngũ CSKH luôn sẵn sàng qua email, hotline và Zalo.' },
];

export function AboutPageClient() {
  return (
    <PageContainer>
      <PageHero
        title="Về CardOn"
        subtitle="Nền tảng mua thẻ game, thẻ điện thoại và nạp cước trực tuyến uy tín tại Việt Nam."
      />

      <section className="mt-8 rounded-2xl border border-cardon-border bg-white p-6 shadow-card md:p-8">
        <h2 className="text-xl font-bold text-cardon-navy">CardOn là gì?</h2>
        <p className="mt-4 text-sm leading-relaxed text-cardon-gray md:text-base">
          CardOn.vn là nền tảng thương mại điện tử chuyên cung cấp thẻ game, thẻ điện thoại và dịch vụ nạp cước
          trực tuyến. Chúng tôi kết nối trực tiếp với các nhà cung cấp uy tín, đảm bảo giao mã nhanh chóng và
          hỗ trợ khách hàng 24/7.
        </p>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {MISSION_CARDS.map((card) => (
          <div key={card.title} className="rounded-2xl border border-cardon-border bg-white p-5 shadow-card">
            <span className="text-2xl">{card.icon}</span>
            <h3 className="mt-3 font-bold text-cardon-navy">{card.title}</h3>
            <p className="mt-2 text-sm text-cardon-gray">{card.desc}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 rounded-2xl bg-gradient-to-r from-cardon-navy to-cardon-blue p-6 text-white shadow-card md:p-8">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-2xl font-bold md:text-3xl">{s.value}</p>
              <p className="mt-1 text-sm text-white/80">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-bold text-cardon-navy">Vì sao chọn CardOn?</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {WHY_CHOOSE.map((item) => (
            <div key={item.title} className="flex gap-4 rounded-2xl border border-cardon-border bg-white p-5 shadow-card">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xl">
                {item.icon}
              </span>
              <div>
                <h3 className="font-bold text-cardon-navy">{item.title}</h3>
                <p className="mt-1 text-sm text-cardon-gray">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className="rounded-xl bg-cardon-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-cardon-navy">
          Mua thẻ ngay
        </Link>
        <Link href="/lien-he" className="rounded-xl border border-cardon-border bg-white px-5 py-2.5 text-sm font-semibold text-cardon-navy hover:bg-cardon-light">
          Liên hệ chúng tôi
        </Link>
      </div>
    </PageContainer>
  );
}
