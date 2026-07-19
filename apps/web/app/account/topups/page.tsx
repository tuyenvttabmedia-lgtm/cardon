'use client';

import { useEffect, useState } from 'react';
import { ListPagination } from '@/components/ui/ListPagination';
import { accountApi } from '@/services/api-client';
import type { AccountTopup } from '@/types/api';
import { formatVnd } from '@/lib/utils';

const LIST_PAGE_SIZES = [10, 50, 100] as const;

export default function AccountTopupsPage() {
  const [take, setTake] = useState<number>(LIST_PAGE_SIZES[0]);
  const [topups, setTopups] = useState<AccountTopup[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void accountApi
      .listTopups(skip, take)
      .then((result) => {
        setTopups(result.items);
        setTotal(result.total);
      })
      .finally(() => setLoading(false));
  }, [skip, take]);

  if (loading) return <p className="text-cardon-gray">Đang tải...</p>;

  return (
    <div>
      <h2 className="text-lg font-bold text-cardon-navy">Nạp cước</h2>
      <p className="mt-1 text-sm text-cardon-gray">Lịch sử nạp cước của tài khoản</p>
      <div className="mt-4 overflow-x-auto rounded-xl border border-cardon-border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-cardon-light text-cardon-gray">
            <tr>
              <th className="px-4 py-2 font-medium">Số điện thoại</th>
              <th className="px-4 py-2 font-medium">Nhà mạng</th>
              <th className="px-4 py-2 font-medium">Mệnh giá</th>
              <th className="px-4 py-2 font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {topups.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-cardon-gray">
                  Chưa có giao dịch nạp cước nào.
                </td>
              </tr>
            ) : (
              topups.map((t, i) => (
                <tr key={`${t.orderCode ?? i}-${t.phone}`} className="border-t border-cardon-border">
                  <td className="px-4 py-2">{t.phone}</td>
                  <td className="px-4 py-2">{t.network}</td>
                  <td className="px-4 py-2">{formatVnd(t.amount)}</td>
                  <td className="px-4 py-2">{t.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <ListPagination
        skip={skip}
        take={take}
        total={total}
        onPageChange={setSkip}
        onPageSizeChange={setTake}
        pageSizeOptions={LIST_PAGE_SIZES}
        itemLabel="giao dịch"
      />
    </div>
  );
}
