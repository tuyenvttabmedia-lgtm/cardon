import { buildStaticPageMetadata, renderCmsContentPage } from '@/lib/cms-static-page';

export async function generateMetadata() {
  return buildStaticPageMetadata('gioi-thieu');
}

export default function GioiThieuPage() {
  return renderCmsContentPage('gioi-thieu');
}
