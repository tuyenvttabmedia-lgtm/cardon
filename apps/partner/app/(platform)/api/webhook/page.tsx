'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiPageShell } from '@/components/api/ApiSubNav';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useAgentPlatform } from '@/hooks/useAgentPlatform';
import { formatDateTime } from '@/lib/utils';
import { securityApi, ApiClientError } from '@/services/api-client';
import type { AgentSecurityWebhook } from '@/types/platform';

export default function ApiWebhookSecurityPage() {
  const { can } = useAgentPlatform();
  const canManage = can('webhooks.manage');
  const [data, setData] = useState<AgentSecurityWebhook | null>(null);
  const [callbackUrl, setCallbackUrl] = useState('');
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const wh = await securityApi.getWebhook();
      setData(wh);
      setCallbackUrl(wh.callbackUrl ?? '');
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Lỗi tải webhook');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ApiPageShell title="Webhook Security" description="URL callback, secret ký HMAC SHA256, event versioning v1 và lịch sử xoay secret.">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {oneTimeSecret && (
        <Card className="border-red-300 bg-red-50">
          <p className="font-semibold text-red-800">Webhook Secret (một lần)</p>
          <p className="mt-2 break-all font-mono text-sm">{oneTimeSecret}</p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => setOneTimeSecret(null)}>
            Đã lưu
          </Button>
        </Card>
      )}

      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3">
            <div>
              <label className="text-sm text-slate-500">Webhook URL</label>
              <Input
                className="mt-1"
                value={callbackUrl}
                onChange={(e) => setCallbackUrl(e.target.value)}
                disabled={!canManage}
              />
            </div>
            <div>
              <p className="text-sm text-slate-500">Secret (masked)</p>
              <p className="font-mono text-sm">{data.secretMasked ?? 'Chưa có'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Thuật toán</p>
              <p>{data.signatureAlgorithm}</p>
            </div>
            {canManage && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void securityApi.updateWebhook({ callbackUrl, enabled: true }).then(() => load())}>
                  Lưu URL
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    void securityApi.rotateWebhookSecret().then((r) => {
                      setOneTimeSecret(r.secret);
                      void load();
                    })
                  }
                >
                  Xoay secret
                </Button>
              </div>
            )}
          </Card>

          <Card>
            <p className="font-medium">Ví dụ xác minh chữ ký</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-slate-500">Event / Version</dt>
                <dd className="font-mono text-xs">
                  {data.verificationExample.eventHeader ?? 'X-CardOn-Event'} ·{' '}
                  {data.verificationExample.versionHeader ?? 'X-CardOn-Version'} (
                  {data.verificationExample.version ?? 'v1'})
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Header chữ ký</dt>
                <dd className="font-mono">{data.verificationExample.header}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Payload</dt>
                <dd className="font-mono">{data.verificationExample.payload}</dd>
              </div>
            </dl>
            {data.history.length > 0 && (
              <ul className="mt-4 space-y-1 text-xs text-slate-500">
                {data.history.map((h, i) => (
                  <li key={i}>
                    {formatDateTime(h.at)} — {h.action}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </ApiPageShell>
  );
}
