'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Card, ErrorMessage } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { formatDateTime } from '@/lib/utils';
import { agentCenterApi, ApiClientError } from '@/services/api-client';

const PAGE_SIZE = 25;

const TABS = [
  { id: 'email_pending', label: 'Chờ xác minh email' },
  { id: 'kyc_pending', label: 'Chờ KYC' },
  { id: 'submitted', label: 'Chờ duyệt' },
  { id: 'need_more_info', label: 'Yêu cầu bổ sung' },
  { id: 'approved', label: 'Đã duyệt' },
  { id: 'rejected', label: 'Đã từ chối' },
] as const;

type TabId = (typeof TABS)[number]['id'];

type OnboardingItem = {
  id: string;
  agentCode: string;
  companyName: string;
  status: string;
  kycStatus: string | null;
  emailVerified?: boolean;
  userEmail: string | null;
  accountType: string | null;
  createdAt: string;
};

function accountTypeLabel(value: string | null) {
  if (value === 'PERSONAL') return 'Cá nhân';
  if (value === 'HOUSEHOLD') return 'Hộ KD';
  if (value === 'COMPANY') return 'Doanh nghiệp';
  return value ?? '—';
}

export function OnboardingCenterPanel({ showInvite = true }: { showInvite?: boolean }) {
  const [tab, setTab] = useState<TabId>('submitted');
  const [items, setItems] = useState<OnboardingItem[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await agentCenterApi.onboardingQueue({ tab, skip, take: PAGE_SIZE });
      setItems(res.items as OnboardingItem[]);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.agentCenter.loadError);
    } finally {
      setLoading(false);
    }
  }, [tab, skip]);

  useEffect(() => {
    void load();
  }, [load]);

  const page = Math.floor(skip / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{vi.agentCenter.onboardingTitle}</h2>
        <p className="text-sm text-zinc-500">{vi.agentCenter.onboardingHint}</p>
      </div>

      {showInvite && (
        <Card className="text-sm text-zinc-600">
          {vi.agentCenter.registrationInviteNote}{' '}
        <Link href="/agents/registration/invite" className="font-medium text-admin-700 underline">
          {vi.agentCenter.navRegistrationInvite}
        </Link>
        </Card>
      )}

      {error && <ErrorMessage message={error} />}

      <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setSkip(0);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t.id ? 'bg-admin-600 text-white' : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Card className="overflow-x-auto p-0">
        {loading ? (
          <p className="p-4 text-zinc-500">{vi.agentCenter.loading}</p>
        ) : items.length === 0 ? (
          <p className="p-4 text-zinc-500">{vi.agentCenter.onboardingEmpty}</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-zinc-50 text-zinc-500">
              <tr>
                <th className="px-4 py-3">Mã</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Loại</th>
                <th className="px-4 py-3">KYC</th>
                <th className="px-4 py-3">Email ✓</th>
                <th className="px-4 py-3">Ngày tạo</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                  <td className="px-4 py-3 font-mono text-xs">{row.agentCode}</td>
                  <td className="px-4 py-3">{row.userEmail ?? '—'}</td>
                  <td className="px-4 py-3">{accountTypeLabel(row.accountType)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={row.kycStatus === 'SUBMITTED' ? 'warning' : 'default'}>
                      {row.kycStatus ?? 'PENDING'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{row.emailVerified === false ? 'Chưa' : 'Đã xác minh'}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{formatDateTime(row.createdAt)}</td>
                  <td className="px-4 py-3">
                    {row.id.includes('-') && (
                      <Link
                        href={`/agents/${row.id}?tab=information`}
                        className="text-admin-700 hover:underline"
                      >
                        Xem hồ sơ
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center gap-3">
          <Button disabled={skip <= 0} onClick={() => setSkip((s) => Math.max(0, s - PAGE_SIZE))}>
            Trước
          </Button>
          <span className="text-sm text-zinc-500">
            Trang {page}/{totalPages} ({total} mục)
          </span>
          <Button
            disabled={skip + PAGE_SIZE >= total}
            onClick={() => setSkip((s) => s + PAGE_SIZE)}
          >
            Sau
          </Button>
        </div>
      )}
    </div>
  );
}
