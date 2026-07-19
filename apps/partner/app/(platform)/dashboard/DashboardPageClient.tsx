'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, statusToBadgeTone } from '@/components/ui/Badge';
import { Card, StatCard } from '@/components/ui/Card';
import { useAgentProfile } from '@/hooks/useAuth';
import { agentApi, agentPlatformApi, financeApi, orderOperationsApi, securityApi } from '@/services/api-client';
import {
  agentStatusLabel,
  formatDateTime,
  formatVnd,
  getCustomerSiteUrl,
  kycStatusLabel,
  transactionStatusLabel,
} from '@/lib/utils';
import type { AgentPlatformDashboard } from '@/types/platform';
import type { AgentTransactionSummary } from '@/types/api';

export default function DashboardPageClient() {
  const { profile, loading, error } = useAgentProfile();
  const [dashboard, setDashboard] = useState<AgentPlatformDashboard | null>(null);
  const [transactions, setTransactions] = useState<AgentTransactionSummary[]>([]);
  const [recentLogs, setRecentLogs] = useState<Array<{ at: string; type: string; message: string }>>([]);
  const [recentDeposits, setRecentDeposits] = useState<Array<{ id: string; amount: string; at: string }>>([]);
  const [stats, setStats] = useState<import('@/types/platform').AgentOrderStatistics | null>(null);

  useEffect(() => {
    if (!profile) return;
    void agentPlatformApi.getDashboard().then(setDashboard).catch(() => setDashboard(null));
    void agentApi.listTransactions(0, 5).then(setTransactions).catch(() => setTransactions([]));
    void orderOperationsApi.getStatistics().then(setStats).catch(() => setStats(null));
    void securityApi.listLogs(undefined, undefined, 5).then((r) =>
      setRecentLogs(r.items.map((i) => ({ at: i.at, type: i.type, message: i.message }))),
    );
    void financeApi.listDeposits({ take: 5 }).then((r) =>
      setRecentDeposits(
        r.items.slice(0, 5).map((d) => ({
          id: d.id,
          amount: d.amount,
          at: d.time,
        })),
      ),
    );
  }, [profile?.id]);

  if (loading) {
    return <p className="text-slate-500">Đang tải bảng điều khiển…</p>;
  }

  if (error || !profile) {
    return (
      <Card className="mx-auto max-w-lg space-y-4 p-6">
        <h2 className="text-lg font-semibold">Chưa có hồ sơ đại lý</h2>
        <p className="text-sm text-slate-600">
          {error ?? 'Đăng ký tài khoản đại lý trên website CardOn hoặc dùng lời mời từ Admin.'}
        </p>
        <a
          href={`${getCustomerSiteUrl()}/dang-ky-dai-ly`}
          className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Đăng ký đại lý →
        </a>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bảng điều khiển API</h1>
          <p className="text-slate-600">{profile.companyName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={profile.apiEnabled ? 'success' : 'warning'}>
            {agentStatusLabel(profile.status)}
          </Badge>
          <Badge tone={statusToBadgeTone(profile.kyc?.status === 'APPROVED' ? 'SUCCESS' : 'PROCESSING')}>
            KYC: {kycStatusLabel(profile.kyc?.status)}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Số dư ví" value={formatVnd(dashboard?.walletBalance ?? profile.balance.balance)} />
        <StatCard label="API Calls hôm nay" value={String(dashboard?.apiCallsToday ?? 0)} />
        <StatCard label="Đơn API hôm nay" value={String(dashboard?.todayOrders ?? 0)} />
        <StatCard label="Tỷ lệ thành công" value={`${dashboard?.successRate ?? 100}%`} />
        <StatCard label="Latency trung bình" value={stats ? `${stats.cards.avgLatencyMs} ms` : '—'} />
        <StatCard label="Gateway đang sử dụng" value={stats?.cards.gatewayInUse ?? '—'} />
        <StatCard label="Provider" value="—" />
        <StatCard label="Webhook thất bại" value="0" />
        <StatCard label="Thông báo mới" value={String(dashboard?.unreadNotifications ?? 0)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold text-slate-900">Nạp tiền gần đây</h2>
          {recentDeposits.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Chưa có giao dịch nạp.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {recentDeposits.map((d) => (
                <li key={d.id} className="flex justify-between">
                  <span className="text-slate-500">{formatDateTime(d.at)}</span>
                  <span className="font-medium">{formatVnd(d.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/finance/deposits" className="mt-4 inline-block text-sm font-medium text-indigo-600 hover:underline">
            Nạp tiền →
          </Link>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Đơn API gần đây</h2>
            <Link href="/orders/history" className="text-sm font-medium text-indigo-600 hover:underline">
              Xem tất cả
            </Link>
          </div>
          {transactions.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Chưa có đơn API.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {transactions.map((tx) => (
                <li key={tx.request_id} className="flex justify-between gap-2">
                  <span className="truncate font-mono text-xs">{tx.request_id}</span>
                  <Badge tone={statusToBadgeTone(tx.status)}>{transactionStatusLabel(tx.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Nhật ký API</h2>
            <Link href="/api/logs" className="text-sm font-medium text-indigo-600 hover:underline">
              Xem tất cả
            </Link>
          </div>
          {recentLogs.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Chưa có log.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-xs text-slate-600">
              {recentLogs.map((log, i) => (
                <li key={i}>
                  <span className="text-slate-400">{formatDateTime(log.at)}</span> — {log.type}: {log.message}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold text-slate-900">Liên kết nhanh</h2>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {[
              ['/api/keys', 'Khóa API'],
              ['/orders/search', 'Tra cứu đơn'],
              ['/finance/deposits', 'Nạp tiền'],
              ['/reports', 'Báo cáo API'],
            ].map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg border border-slate-200 px-3 py-2 hover:border-indigo-300 hover:bg-indigo-50/50"
              >
                {label}
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
