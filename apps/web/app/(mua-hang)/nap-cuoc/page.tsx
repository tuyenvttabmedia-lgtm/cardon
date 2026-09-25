import type { Metadata } from 'next';
import { HubSeoBlock } from '@/components/seo/HubSeoBlock';
import { TopupPageClient } from '@/components/topup/TopupPageClient';
import { buildMetadata } from '@/lib/seo';

const HUB_TITLE = 'Nạp cước điện thoại';
const HUB_INTRO =
  'Nạp tiền điện thoại Viettel, Mobifone, Vinaphone, Vietnamobile trực tuyến trên CardOn. Cộng cước tự động 24/7, chiết khấu tốt, thanh toán QR an toàn.';

export const metadata: Metadata = buildMetadata({
  title: HUB_TITLE,
  description:
    'Nạp cước Viettel, Mobifone, Vinaphone, Vietnamobile tự động 24/7. Chiết khấu tốt, thanh toán an toàn.',
  path: '/nap-cuoc',
});

export default function NapCuocPage() {
  return (
    <>
      <HubSeoBlock
        path="/nap-cuoc"
        title={HUB_TITLE}
        intro={HUB_INTRO}
        breadcrumbLabel="Nạp cước"
      />
      <TopupPageClient />
    </>
  );
}
