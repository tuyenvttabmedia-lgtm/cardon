import type { Metadata } from 'next';

import { Suspense } from 'react';

import { HuongDanPageClient } from '@/components/guide/HuongDanPageClient';

import { listBlogPosts } from '@/lib/cms-api';

import { buildMetadata } from '@/lib/seo';



export const metadata: Metadata = buildMetadata({

  title: 'Hướng dẫn — CardOn.vn',

  description: 'Hướng dẫn mua thẻ game, thanh toán và nạp cước tại CardOn.vn',

  path: '/huong-dan',

});



export default async function HuongDanPage() {

  const posts = (await listBlogPosts({ category: 'guide', take: 100 })) ?? [];



  return (

    <Suspense fallback={<p className="page-shell text-center text-cardon-gray">Đang tải...</p>}>

      <HuongDanPageClient posts={posts} />

    </Suspense>

  );

}

