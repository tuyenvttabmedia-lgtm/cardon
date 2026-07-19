'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useThemeSettings } from '@/hooks/useThemeSettings';
import { WEB_BUILD_VERSION } from '@/lib/build-version';
import type { FooterColumn } from '@/lib/footer-config';
import { SITE_NAME } from '@/lib/utils';

const TRUST_ITEMS = [
  { icon: '⚡', title: 'Giao mã tức thì', desc: 'Nhận thẻ ngay sau thanh toán' },
  { icon: '🔒', title: 'Thanh toán an toàn', desc: 'QR ngân hàng & chuyển khoản bảo mật' },
  { icon: '🎧', title: 'Hỗ trợ 24/7', desc: 'Luôn sẵn sàng hỗ trợ bạn' },
  { icon: '✓', title: 'Uy tín CardOn', desc: 'Nền tảng phân phối số #1' },
];

function FooterColumnLinks({ col }: { col: FooterColumn }) {
  return (
    <div className="min-w-0">
      <p className="font-semibold text-white">{col.title}</p>
      <ul className="mt-3 space-y-2 text-sm text-white/75">
        {col.links.map((link) => (
          <li key={`${col.title}-${link.label}`}>
            {link.href.startsWith('mailto:') || link.href.startsWith('tel:') ? (
              <a href={link.href} className="hover:text-cardon-orange">
                {link.label}
              </a>
            ) : (
              <Link href={link.href} className="hover:text-cardon-orange">
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  const { footerColumns, companyInfo } = useThemeSettings();

  useEffect(() => {
    console.log(`WEB_BUILD_VERSION=${WEB_BUILD_VERSION}`);
  }, []);

  return (
    <footer className="mt-auto border-t border-cardon-border bg-cardon-navy pb-20 text-white md:pb-0">
      <div className="site-container grid gap-6 py-8 sm:grid-cols-2 lg:grid-cols-4">
        {TRUST_ITEMS.map((item) => (
          <div key={item.title} className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg">
              {item.icon}
            </span>
            <div>
              <p className="font-semibold">{item.title}</p>
              <p className="mt-0.5 text-sm text-white/70">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/10 bg-[#152d6b]">
        <div className="site-container py-10">
          {/* Mobile ≤767px: CMS columns only, 2×2 grid (company + link groups) */}
          <div className="footer-links grid grid-cols-2 items-start gap-x-8 gap-y-8 md:hidden">
            {footerColumns.map((col) => (
              <FooterColumnLinks key={col.title} col={col} />
            ))}
          </div>

          {/* Desktop: 4 columns */}
          <div className="footer-links hidden grid-cols-2 items-start gap-x-8 gap-y-8 md:grid lg:grid-cols-4">
            {footerColumns.map((col) => (
              <FooterColumnLinks key={`desktop-${col.title}`} col={col} />
            ))}
          </div>
        </div>

        <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">
          © {new Date().getFullYear()} {companyInfo.companyName || SITE_NAME}. Bản quyền thuộc CardOn.vn
        </div>
      </div>
    </footer>
  );
}
