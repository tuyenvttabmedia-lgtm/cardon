import type { Metadata } from 'next';
import { HubSeoBlock } from '@/components/seo/HubSeoBlock';
import { DataPageClient } from '@/components/topup/DataPageClient';
import { buildMetadata } from '@/lib/seo';

const HUB_TITLE = 'Nạp data 3G/4G/5G';
const HUB_INTRO =
  'Mua gói data 3G/4G/5G Viettel, Mobifone, Vinaphone trên CardOn. Kích hoạt tự động sau thanh toán, nhiều gói ngày/tháng, hỗ trợ 24/7.';

export const metadata: Metadata = buildMetadata({
  title: HUB_TITLE,
  description:
    'Mua gói data Viettel, Mobifone, Vinaphone tự động 24/7. Thanh toán an toàn trên CardOn.',
  path: '/nap-data',
});

export default function NapDataPage() {
  return (
    <>
      <HubSeoBlock
        path="/nap-data"
        title={HUB_TITLE}
        intro={HUB_INTRO}
        breadcrumbLabel="Nạp data"
      />
      <DataPageClient />
    </>
  );
}
