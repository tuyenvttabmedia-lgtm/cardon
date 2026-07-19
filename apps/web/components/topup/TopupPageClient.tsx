'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckoutShell } from '@/components/checkout/CheckoutShell';
import { FaqSection } from '@/components/faq/FaqSection';
import { getSiteConfig, type PublicSiteConfig } from '@/lib/cms-api';

export function TopupPageClient() {
  const [siteConfig, setSiteConfig] = useState<PublicSiteConfig | null>(null);

  useEffect(() => {
    void getSiteConfig().then(setSiteConfig);
  }, []);

  const topupReady = siteConfig?.topup.ready ?? false;

  return (
    <>
      <CheckoutShell
        mode="TOPUP"
        anchorId="checkout-topup"
        serviceUnavailable={
          siteConfig && !topupReady ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Dịch vụ nạp cước tạm ngưng</p>
              <p className="mt-1 text-amber-800">
                {siteConfig.topup.reason === 'ADMIN_DISABLED'
                  ? 'Quản trị viên đã tắt tính năng nạp cước.'
                  : siteConfig.topup.reason === 'PROVIDER_NOT_CONFIGURED'
                    ? 'Nhà cung cấp nạp cước chưa được cấu hình.'
                    : 'Hệ thống nạp cước đang được hoàn thiện. Bạn có thể xem trước giao diện nhưng chưa thể thanh toán.'}
              </p>
            </div>
          ) : null
        }
      />
      <FaqSection
        position="topup"
        limit={10}
        showViewAll
        viewAllHref="/tro-giup?position=topup"
        className="mt-8"
      />
    </>
  );
}

export { TelcoOrderSummaryPanel as TopupSummaryPanel } from '@/components/checkout/CheckoutSummaryPanels';
