'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PlatformSection } from '@/components/platform/PlatformSection';
import { useAgentPlatform } from '@/hooks/useAgentPlatform';
import { AGENT_PLATFORM_ROLES, AGENT_ROLE_LABELS } from '@/lib/agent-platform/rbac';
import { formatDateTime } from '@/lib/utils';
import { organizationApi, ApiClientError } from '@/services/api-client';
import type { AgentOrganizationInvite, AgentOrganizationUser, AgentPlatformRole } from '@/types/platform';

export default function UsersPageClient() {
  const { can } = useAgentPlatform();
  const canManage = can('users.manage');
  const [users, setUsers] = useState<AgentOrganizationUser[]>([]);
  const [invites, setInvites] = useState<AgentOrganizationInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AgentPlatformRole>('OPERATOR');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await organizationApi.listUsers({ page: 1, limit: 50 });
      setUsers(data.items);
      setInvites(data.invites);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Không tải được danh sách');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleInvite = async () => {
    if (!canManage || !inviteEmail.trim()) return;
    try {
      await organizationApi.inviteUser({ email: inviteEmail.trim(), role: inviteRole });
      setMsg('Đã gửi lời mời');
      setInviteEmail('');
      void load();
    } catch (e) {
      setMsg(e instanceof ApiClientError ? e.message : 'Mời thất bại');
    }
  };

  return (
    <PlatformSection title="Người dùng" description="Quản lý thành viên tổ chức — cùng ví, cùng API key, quyền riêng.">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {msg && <p className="text-sm text-emerald-600">{msg}</p>}

      {canManage && (
        <Card className="flex flex-wrap gap-2 p-4">
          <Input
            className="min-w-[220px] flex-1"
            placeholder="Email người được mời"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as AgentPlatformRole)}
          >
            {AGENT_PLATFORM_ROLES.filter((r) => r !== 'OWNER').map((r) => (
              <option key={r} value={r}>{AGENT_ROLE_LABELS[r]}</option>
            ))}
          </select>
          <Button onClick={() => void handleInvite()}>Mời thành viên</Button>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900">
            <tr>
              <th className="px-3 py-3">Tên / Email</th>
              <th className="px-3 py-3">Vai trò</th>
              <th className="px-3 py-3">Trạng thái</th>
              <th className="px-3 py-3">Đăng nhập cuối</th>
              <th className="px-3 py-3">2FA</th>
              {canManage && <th className="px-3 py-3" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Đang tải…</td></tr>
            ) : !users.length ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Chưa có thành viên</td></tr>
            ) : (
              users.map((m) => (
                <tr key={m.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-3">
                    <p className="font-medium">{m.name}</p>
                    <p className="text-xs text-slate-500">{m.email}</p>
                  </td>
                  <td className="px-3 py-3"><Badge tone="info">{m.roleLabel}</Badge></td>
                  <td className="px-3 py-3">{m.status}</td>
                  <td className="px-3 py-3">{m.lastLoginAt ? formatDateTime(m.lastLoginAt) : '—'}</td>
                  <td className="px-3 py-3">{m.twoFactorEnabled ? 'Bật' : 'Tắt'}</td>
                  {canManage && m.role !== 'OWNER' && (
                    <td className="px-3 py-3">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void organizationApi.deleteUser(m.id).then(() => load())}
                      >
                        Xóa
                      </Button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {!!invites.length && (
        <Card className="mt-4">
          <h3 className="font-semibold">Lời mời đang chờ</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{i.email} — {i.roleLabel} — hết hạn {formatDateTime(i.expiresAt)}</span>
                {canManage && (
                  <Button variant="secondary" size="sm" onClick={() => void organizationApi.cancelInvite(i.id).then(() => load())}>
                    Hủy
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </PlatformSection>
  );
}
