'use client';

import { Button } from '@/components/ui/Button';
import {
  partnerLoginUrl,
  wrongRetailPortalMessage,
} from '@/lib/retail-auth';

export function WrongRetailPortalNotice({
  role,
  onLogout,
}: {
  role: string | null | undefined;
  onLogout: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center shadow-card md:p-8">
      <p className="text-lg font-bold text-cardon-navy">Sai cổng đăng nhập</p>
      <p className="mt-2 text-sm text-cardon-gray">{wrongRetailPortalMessage(role)}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <a
          href={partnerLoginUrl()}
          className="inline-flex items-center justify-center rounded-xl bg-cardon-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-cardon-navy"
        >
          Đi tới Cổng đối tác
        </a>
        <Button type="button" variant="secondary" onClick={onLogout}>
          Đăng xuất khỏi website bán lẻ
        </Button>
      </div>
    </div>
  );
}
