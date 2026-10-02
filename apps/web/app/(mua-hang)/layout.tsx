import { CheckoutChrome } from '@/components/checkout/CheckoutChrome';
import { MuaHangSeo } from '@/components/seo/MuaHangSeo';
import { StorefrontDataProvider } from '@/components/storefront/StorefrontDataProvider';
import { listBanners } from '@/lib/cms-api';
import { listActiveProducts } from '@/lib/product-api';

export default async function MuaHangLayout({ children }: { children: React.ReactNode }) {
  const [products, banners] = await Promise.all([
    listActiveProducts(),
    listBanners('HOME_HERO'),
  ]);
  const heroBanners = (banners ?? []).filter((row) => Boolean(row.imageUrl));

  return (
    <StorefrontDataProvider products={products ?? []} heroBanners={heroBanners}>
      <MuaHangSeo />
      <CheckoutChrome>{children}</CheckoutChrome>
    </StorefrontDataProvider>
  );
}
