'use client';

import { usePathname } from 'next/navigation';
import { SectionNav } from '@/components/ui/Navigation';

const SECTIONS = [
  { href: '/esim-ops', label: 'Đơn hàng', exact: true },
  { href: '/esim-ops/payments', label: 'Thanh toán' },
  { href: '/esim-ops/attempts', label: 'Nhật ký cấp' },
];

export function EsimOpsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-5">
      <SectionNav
        ariaLabel="eSIM Operations Center"
        items={SECTIONS.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return { href: item.href, label: item.label, active };
        })}
      />
      {children}
    </div>
  );
}
