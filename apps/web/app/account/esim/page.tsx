'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { EsimManageCard } from '@/components/esim/EsimManageCard';
import { useT } from '@/components/i18n/LocaleProvider';
import { ACCOUNT_PATHS } from '@/lib/account-routes';
import { accountApi } from '@/services/api-client';
import type { EsimDelivery } from '@/types/api';

function rankEsim(kind: EsimDelivery['kind']): number {
  if (kind === 'ready') return 0;
  if (kind === 'waiting') return 1;
  if (kind === 'stuck') return 2;
  return 3;
}

export default function AccountEsimPage() {
  const t = useT();
  const [rows, setRows] = useState<EsimDelivery[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const items = await accountApi.listEsimProfiles();
        if (active) {
          setRows(items);
          setError('');
        }
      } catch {
        if (active) setError('Không tải được eSIM của tài khoản.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => void load(), 20_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <section>
      <h1 className="text-lg font-bold text-cardon-navy md:text-xl">{t('esim.manageTitle')}</h1>
      <p className="mt-1 max-w-2xl text-sm text-cardon-gray">{t('esim.manageLead')}</p>
      {loading ? <p className="mt-6 text-sm text-cardon-gray">Đang tải…</p> : null}
      {error ? <p className="mt-6 text-sm text-red-600">{error}</p> : null}
      {!loading && !error && rows.length === 0 ? (
        <p className="mt-6 text-sm text-cardon-gray">
          Chưa có eSIM.{' '}
          <Link href="/esim" className="font-semibold text-cardon-blue hover:underline">
            Xem gói eSIM du lịch
          </Link>
        </p>
      ) : null}
      <ul className="mt-6 space-y-4">
        {[...rows]
          .sort((a, b) => rankEsim(a.kind) - rankEsim(b.kind))
          .map((row) => (
            <li key={row.id ?? row.orderId}>
              <EsimManageCard esim={row} />
            </li>
          ))}
      </ul>
      <p className="mt-6 text-sm text-cardon-gray">
        <Link href="/esim" className="font-semibold text-cardon-blue hover:underline">
          Mua thêm eSIM
        </Link>
        {' · '}
        <Link href={ACCOUNT_PATHS.orders} className="font-semibold text-cardon-blue hover:underline">
          Lịch sử giao dịch
        </Link>
      </p>
    </section>
  );
}
