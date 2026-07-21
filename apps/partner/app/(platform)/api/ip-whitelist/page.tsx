'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiPageShell } from '@/components/api/ApiSubNav';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useAgentPlatform } from '@/hooks/useAgentPlatform';
import { formatDateTime } from '@/lib/utils';
import { securityApi, ApiClientError } from '@/services/api-client';
import type { AgentIpWhitelistEntry } from '@/types/platform';

function statusLabel(row: AgentIpWhitelistEntry): string {
  const status = row.status ?? 'APPROVED';
  if (status === 'PENDING') return 'Chờ Admin duyệt';
  if (status === 'REJECTED') return 'Từ chối';
  return row.enabled ? 'Đã duyệt · Bật' : 'Đã duyệt · Tắt';
}

export default function IpWhitelistPage() {
  const { can } = useAgentPlatform();
  const canManage = can('api.manage');
  const [items, setItems] = useState<AgentIpWhitelistEntry[]>([]);
  const [search, setSearch] = useState('');
  const [cidr, setCidr] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await securityApi.listIpWhitelist(search || undefined);
      setItems(data.items);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Lỗi tải dữ liệu');
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addEntry() {
    if (!canManage) return;
    try {
      setError(null);
      await securityApi.createIpWhitelist({ cidr, description });
      setCidr('');
      setDescription('');
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Thêm IP thất bại');
    }
  }

  return (
    <ApiPageShell
      title="IP Whitelist"
      description="Gửi IP/CIDR máy chủ gọi API. CardOn Admin duyệt xong IP mới được phép kết nối — giúp bảo mật và giảm tải khi IP lạ spam API. Hệ thống còn có rate-limit theo đại lý."
    >
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card className="border-amber-200 bg-amber-50 text-sm text-amber-950">
        IP mới ở trạng thái <strong>Chờ Admin duyệt</strong> và chưa dùng được cho API. Khi chưa có IP nào được
        duyệt, hệ thống tạm cho phép mọi IP (tương thích đại lý cũ).
      </Card>

      {canManage && (
        <Card className="grid gap-3 sm:grid-cols-3">
          <Input
            placeholder="192.168.1.0/24 hoặc IPv6"
            value={cidr}
            onChange={(e) => setCidr(e.target.value)}
          />
          <Input
            placeholder="Mô tả"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button onClick={() => void addEntry()}>Gửi IP chờ duyệt</Button>
        </Card>
      )}

      <Card className="mb-3">
        <Input placeholder="Tìm kiếm…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </Card>

      <Card className="overflow-x-auto p-0">
        {!items.length ? (
          <p className="p-6 text-center text-sm text-slate-500">
            Chưa có IP — mọi IP đang được phép cho đến khi có IP được Admin duyệt.
          </p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">CIDR/IP</th>
                <th className="px-4 py-3">Mô tả</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3">Lần dùng</th>
                {canManage && <th className="px-4 py-3">Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const status = row.status ?? 'APPROVED';
                return (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono text-xs">{row.cidr}</td>
                    <td className="px-4 py-3">{row.description || '—'}</td>
                    <td className="px-4 py-3">{statusLabel(row)}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {row.lastUsedAt ? formatDateTime(row.lastUsedAt) : '—'}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        {status === 'APPROVED' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              void securityApi
                                .updateIpWhitelist(row.id, { enabled: !row.enabled })
                                .then(() => load())
                                .catch((e) =>
                                  setError(e instanceof ApiClientError ? e.message : 'Cập nhật thất bại'),
                                )
                            }
                          >
                            {row.enabled ? 'Tắt' : 'Bật'}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          className="ml-2"
                          onClick={() =>
                            void securityApi
                              .deleteIpWhitelist(row.id)
                              .then(() => load())
                              .catch((e) =>
                                setError(e instanceof ApiClientError ? e.message : 'Xóa thất bại'),
                              )
                          }
                        >
                          Xóa
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </ApiPageShell>
  );
}
