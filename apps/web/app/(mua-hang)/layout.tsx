import { CheckoutChrome } from '@/components/checkout/CheckoutChrome';
import { MuaHangSeo } from '@/components/seo/MuaHangSeo';

export default function MuaHangLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MuaHangSeo />
      <CheckoutChrome>{children}</CheckoutChrome>
    </>
  );
}
