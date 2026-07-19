'use client';

import { useEffect, useState } from 'react';
import { accountApi } from '@/services/api-client';
import type { AccountDataOrder } from '@/types/api';
import { formatVnd } from '@/lib/utils';

export default function AccountDataPage() {
  const [items, setItems] = useState<AccountDataOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void accountApi.listDataOrders().then(setItems).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-cardon-gray">Đang tải...</p>;

  return (
    <div>
      <h2 className="text-lg font-bold text-cardon-navy">Nạp Data</h2>
      <p className="mt-1 text-sm text-cardon-gray">Lịch sử nạp Data của tài khoản</p>
      <div className="mt-4 overflow-x-auto rounded-xl border border-cardon-border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-cardon-light text-cardon-gray">
            <tr>
              <th className="px-4 py-2 font-medium">Mã đơn</th>
              <th className="px-4 py-2 font-medium">Gói cước</th>
              <th className="px-4 py-2 font-medium">Giá trị</th>
              <th className="px-4 py-2 font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-cardon-gray">
                  Chưa có giao dịch nạp Data nào.
                </td>
              </tr>
            ) : (
              items.map((t) => (
                <tr key={`${t.orderCode}-${t.productName}`} className="border-t border-cardon-border">
                  <td className="px-4 py-2">{t.orderCode}</td>
                  <td className="px-4 py-2">{t.productName}</td>
                  <td className="px-4 py-2">{formatVnd(t.amount)}</td>
                  <td className="px-4 py-2">{t.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
