import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContactPageClient } from '@/components/contact/ContactPageClient';
import { CmsPageView } from '@/components/cms/CmsPageView';
import { getCmsPage, listStaticNavPages } from '@/lib/cms-api';
import { GIOI_THIEU_LANDING_HTML } from '@/lib/cms-block-snippets';
import { defaultPageLayoutForSlug, resolveEffectivePageLayout, type CmsPageLayoutValue } from '@/lib/cms-page-layout';
import { buildCmsMetadata } from '@/lib/seo';
import { staticPageLabel } from '@/lib/static-pages';

export const CMS_STATIC_FALLBACK: Record<string, string> = {
  'chinh-sach-bao-mat': `
    <p>CardOn.vn cam kết bảo vệ thông tin cá nhân của khách hàng theo quy định pháp luật Việt Nam.</p>
    <h2>Thu thập thông tin</h2>
    <p>Chúng tôi thu thập email, số điện thoại và thông tin giao dịch cần thiết để xử lý đơn hàng.</p>
    <h2>Bảo mật</h2>
    <p>Dữ liệu được mã hóa và lưu trữ an toàn. Chúng tôi không chia sẻ thông tin cho bên thứ ba ngoài mục đích xử lý thanh toán.</p>
  `,
  'dieu-khoan-su-dung': `
    <p>Bằng việc sử dụng CardOn.vn, bạn đồng ý với các điều khoản dưới đây.</p>
    <h2>Dịch vụ</h2>
    <p>CardOn cung cấp nền tảng mua thẻ số và nạp cước trực tuyến.</p>
    <h2>Trách nhiệm người dùng</h2>
    <p>Khách hàng cần cung cấp thông tin chính xác và không sử dụng dịch vụ cho mục đích trái pháp luật.</p>
  `,
  'chinh-sach-hoan-tien': `
    <p>CardOn hỗ trợ hoàn tiền trong các trường hợp giao dịch lỗi do hệ thống hoặc nhà cung cấp.</p>
    <h2>Điều kiện hoàn tiền</h2>
    <ul><li>Đơn hàng không được giao sau 24 giờ (trừ lỗi từ phía khách hàng)</li><li>Mã thẻ bị lỗi xác minh bởi nhà cung cấp</li></ul>
    <h2>Quy trình</h2>
    <p>Liên hệ support@cardon.vn kèm mã đơn hàng để được xử lý trong 3–5 ngày làm việc.</p>
  `,
  'chinh-sach-thanh-toan': `
    <p>CardOn chấp nhận thanh toán qua chuyển khoản ngân hàng và QR code.</p>
    <h2>Phương thức</h2>
    <p>Thanh toán được xử lý tự động sau khi hệ thống xác nhận giao dịch.</p>
  `,
  'gioi-thieu': GIOI_THIEU_LANDING_HTML,
  'lien-he': `
    <p>Liên hệ CardOn.vn — chúng tôi luôn sẵn sàng hỗ trợ bạn 24/7.</p>
  `,
};

const FALLBACK_EXCERPTS: Record<string, string> = {
  'gioi-thieu':
    'Nền tảng mua thẻ game, thẻ điện thoại và nạp cước trực tuyến uy tín tại Việt Nam.',
};

export async function buildStaticPageMetadata(slug: string): Promise<Metadata> {
  const page = await getCmsPage(slug);
  const title = page?.seo?.metaTitle ?? page?.title ?? staticPageLabel(slug);
  const description =
    page?.seo?.metaDescription ?? page?.excerpt ?? `${staticPageLabel(slug)} — CardOn.vn`;
  return buildCmsMetadata(page ?? { title, excerpt: description, slug }, page?.seo ?? null, '');
}

async function resolvePageContent(slug: string) {
  const [page, navPages] = await Promise.all([getCmsPage(slug), listStaticNavPages()]);
  const title = page?.title ?? staticPageLabel(slug);
  const content = page?.content ?? CMS_STATIC_FALLBACK[slug];
  const excerpt = page?.excerpt ?? FALLBACK_EXCERPTS[slug] ?? null;
  const inNav = navPages?.some((p) => p.slug === slug) ?? false;
  const pageLayout = resolveEffectivePageLayout(slug, page?.pageLayout, {
    inNav,
    content: content ?? '',
  });
  const navItems = navPages?.map((p) => ({ slug: p.slug, label: p.title }));

  if (!content) return null;

  return { slug, title, content, excerpt, pageLayout, navItems };
}

export async function renderStaticPage(slug: string) {
  const resolved = await resolvePageContent(slug);
  if (!resolved) notFound();
  return <CmsPageView {...resolved} />;
}

export async function renderCmsContentPage(slug: string) {
  return renderStaticPage(slug);
}

export async function renderContactPage() {
  const page = await getCmsPage('lien-he');
  const title = page?.title ?? staticPageLabel('lien-he');
  const intro = page?.content ?? CMS_STATIC_FALLBACK['lien-he'];
  const subtitle = page?.excerpt?.trim() || 'Chúng tôi luôn sẵn sàng hỗ trợ bạn 24/7.';

  return <ContactPageClient title={title} subtitle={subtitle} introHtml={intro} />;
}
