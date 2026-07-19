'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useThemeSettings } from '@/hooks/useThemeSettings';

const FEATURES = [
  { icon: '⚡', title: 'Nhận mã thẻ tức thì', desc: 'Giao tự động sau thanh toán' },
  { icon: '🔒', title: 'Thanh toán QR an toàn', desc: 'Chuyển khoản & QR bảo mật' },
  { icon: '📋', title: 'Quản lý lịch sử giao dịch', desc: 'Tra cứu đơn hàng mọi lúc' },
];

function AuthBrandPanel() {
  const { logoDesktop, logoMobile } = useThemeSettings();
  const logoSrc = logoMobile || logoDesktop || '/images/cardon-icon.png';

  return (
    <div className="relative hidden flex-col overflow-hidden bg-gradient-to-br from-cardon-navy via-[#1a4fad] to-cardon-blue p-8 text-white lg:flex lg:min-h-[560px]">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-cardon-blue/40 blur-3xl" />

      <div className="relative z-10">
        <Image
          src={logoSrc}
          alt="CardOn"
          width={160}
          height={48}
          className="h-11 w-auto max-w-[180px] object-contain object-left"
          unoptimized
        />
        <h2 className="mt-8 text-2xl font-bold leading-snug">
          Mua thẻ & nạp cước online nhanh chóng
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-white/80">
          Hệ thống phân phối mã thẻ tự động, an toàn 24/7
        </p>
      </div>

      <ul className="relative z-10 mt-8 space-y-3">
        {FEATURES.map((f) => (
          <li
            key={f.title}
            className="flex items-start gap-3 rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-lg">
              {f.icon}
            </span>
            <div>
              <p className="text-sm font-semibold">{f.title}</p>
              <p className="text-xs text-white/70">{f.desc}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="relative z-10 mt-auto pt-8">
        <div className="relative mx-auto max-w-[220px] rotate-[-4deg] rounded-2xl border border-white/20 bg-white/10 p-4 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="text-lg">💳</span>
            <span>Thẻ game · Nạp cước</span>
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-2 w-full rounded-full bg-white/20" />
            <div className="h-2 w-3/4 rounded-full bg-white/15" />
          </div>
          <p className="mt-3 text-[10px] text-white/60">Giao mã tức thì sau thanh toán</p>
          <span className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-cardon-orange text-sm shadow-lg">
            ✓
          </span>
        </div>
      </div>
    </div>
  );
}

export function AuthLayout({
  title,
  subtitle,
  formHint,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  formHint?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { logoDesktop } = useThemeSettings();

  return (
    <div className="page-shell py-6 md:py-12">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-cardon-border bg-white shadow-card">
        <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <AuthBrandPanel />

          <div className="flex min-h-[480px] flex-col justify-center p-6 md:p-10 lg:min-h-[560px]">
            <div className="mx-auto w-full max-w-[420px]">
              <div className="mb-6 lg:hidden">
                <Link href="/">
                  <Image
                    src={logoDesktop}
                    alt="CardOn"
                    width={140}
                    height={40}
                    className="h-9 w-auto max-w-[140px] object-contain"
                    unoptimized
                  />
                </Link>
              </div>
              {formHint && (
                <p className="mb-1 text-sm font-medium text-cardon-blue">{formHint}</p>
              )}
              <h1 className="text-2xl font-bold text-cardon-navy">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-cardon-gray">{subtitle}</p>}
              <div className="mt-6">{children}</div>
              {footer && <div className="mt-6">{footer}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
