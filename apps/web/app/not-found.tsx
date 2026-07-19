import Link from 'next/link';
import { PageContainer } from '@/components/layout/PageContainer';

export default function NotFound() {
  return (
    <PageContainer className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="rounded-2xl border border-cardon-border bg-white p-8 shadow-card md:p-12">
        <div className="mx-auto flex h-32 w-32 items-center justify-center rounded-full bg-blue-50 text-6xl" aria-hidden>
          🔍
        </div>
        <h1 className="mt-6 text-6xl font-bold text-cardon-navy">404</h1>
        <p className="mt-3 text-lg font-semibold text-cardon-navy">Không tìm thấy trang</p>
        <p className="mt-2 max-w-md text-sm text-cardon-gray">
          Trang bạn đang tìm kiếm không tồn tại hoặc đã được di chuyển.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-xl bg-cardon-blue px-6 py-3 text-sm font-semibold text-white hover:bg-cardon-navy"
          >
            Về trang chủ
          </Link>
          <Link
            href="/?section=buy-card&category=game"
            className="rounded-xl border border-cardon-border bg-white px-6 py-3 text-sm font-semibold text-cardon-navy hover:bg-cardon-light"
          >
            Mua thẻ ngay
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}
