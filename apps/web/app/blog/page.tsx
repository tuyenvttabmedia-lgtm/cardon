import { permanentRedirect } from 'next/navigation';

export default async function BlogListRedirect() {
  permanentRedirect('/tin-tuc');
}
