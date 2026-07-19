'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckoutShell } from '@/components/checkout/CheckoutShell';
import { FaqSection } from '@/components/faq/FaqSection';
import { getSiteConfig, type PublicSiteConfig } from '@/lib/cms-api';

export function DataPageClient() {
  const [siteConfig, setSiteConfig] = useState<PublicSiteConfig | null>(null);

  useEffect(() => {
    void getSiteConfig().then(setSiteConfig);
  }, []);

  const dataReady = siteConfig?.data?.ready ?? false;

  if (siteConfig && !dataReady) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <p className="text-lg font-semibold">Dịch vụ nạp data tạm ngưng</p>
        <p className="mt-2 text-amber-800">
          Nhà cung cấp eSale hiện chưa hỗ trợ API nạp data. CardOn sẽ mở lại dịch vụ khi tích hợp
          hoàn tất.
        </p>
        <Link href="/" className="mt-4 inline-block font-semibold text-cardon-blue hover:underline">
          ← Về trang chủ
        </Link>
      </div>
    );
  }

  return (
    <>
      <CheckoutShell
        mode="DATA"
        anchorId="checkout-data"
        serviceUnavailable={
          siteConfig && !dataReady ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Dịch vụ nạp data tạm ngưng</p>
            </div>
          ) : null
        }
      />
      <FaqSection
        position="data"
        limit={10}
        showViewAll
        viewAllHref="/tro-giup?position=data"
        className="mt-8"
      />
    </>
  );
}
