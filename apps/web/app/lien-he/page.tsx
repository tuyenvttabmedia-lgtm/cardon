import { buildStaticPageMetadata, renderContactPage } from '@/lib/cms-static-page';

export async function generateMetadata() {
  return buildStaticPageMetadata('lien-he');
}

export default function LienHePage() {
  return renderContactPage();
}
