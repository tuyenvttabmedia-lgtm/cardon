'use client';

import { useState } from 'react';
import { ApiPageShell } from '@/components/api/ApiSubNav';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useAgentPlatform } from '@/hooks/useAgentPlatform';
import { apiOpsApi, ApiClientError } from '@/services/api-client';

const PRESETS = [
  { label: 'Số dư', method: 'GET' as const, path: '/balance' },
  { label: 'Sản phẩm', method: 'GET' as const, path: '/products' },
  { label: 'Providers', method: 'GET' as const, path: '/providers' },
  { label: 'Mua thẻ', method: 'POST' as const, path: '/cards/buy', body: '{"product_code":"GARENA_100K","quantity":1,"request_id":""}' },
];

export default function ApiTestPageClient() {
  const { can } = useAgentPlatform();
  const canTest = can('api.manage');
  const [method, setMethod] = useState<'GET' | 'POST'>('GET');
  const [path, setPath] = useState('/balance');
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [requestId, setRequestId] = useState(`test-${Date.now()}`);
  const [body, setBody] = useState('{}');
  const [result, setResult] = useState<Awaited<ReturnType<typeof apiOpsApi.test>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!canTest) return;
    setLoading(true);
    setError(null);
    try {
      let parsed: Record<string, unknown> | undefined;
      if (method === 'POST') {
        parsed = JSON.parse(body) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object' && 'request_id' in parsed) {
          parsed.request_id = requestId;
        }
      }
      const res = await apiOpsApi.test({
        method,
        path,
        apiKey,
        secretKey,
        requestId,
        body: parsed,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Thực thi thất bại');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ApiPageShell title="Thử API" description="Console thử nghiệm — ký HMAC và gọi API production thật.">
      {!canTest && (
        <p className="text-sm text-amber-700">Readonly không được dùng Test API. Cần quyền Owner/Manager có api.manage.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.path}
            size="sm"
            variant="secondary"
            onClick={() => {
              setMethod(p.method);
              setPath(p.path);
              if (p.body) setBody(p.body.replace('""', `"${requestId}"`));
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <Card className="grid gap-3 p-4 lg:grid-cols-2">
        <div>
          <label className="text-sm text-slate-500">Method</label>
          <select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={method} onChange={(e) => setMethod(e.target.value as 'GET' | 'POST')}>
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-slate-500">Path</label>
          <Input className="mt-1 font-mono" value={path} onChange={(e) => setPath(e.target.value)} />
        </div>
        <div>
          <label className="text-sm text-slate-500">API Key</label>
          <Input className="mt-1 font-mono" value={apiKey} onChange={(e) => setApiKey(e.target.value)} disabled={!canTest} />
        </div>
        <div>
          <label className="text-sm text-slate-500">Secret Key</label>
          <Input className="mt-1 font-mono" type="password" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} disabled={!canTest} />
        </div>
        <div className="lg:col-span-2">
          <label className="text-sm text-slate-500">X-REQUEST-ID</label>
          <Input className="mt-1 font-mono" value={requestId} onChange={(e) => setRequestId(e.target.value)} disabled={!canTest} />
        </div>
        {method === 'POST' && (
          <div className="lg:col-span-2">
            <label className="text-sm text-slate-500">Body JSON</label>
            <textarea className="mt-1 w-full rounded-lg border p-3 font-mono text-xs" rows={6} value={body} onChange={(e) => setBody(e.target.value)} disabled={!canTest} />
          </div>
        )}
        <div className="lg:col-span-2">
          <Button onClick={() => void run()} disabled={!canTest || loading}>
            {loading ? 'Đang gửi…' : 'Thực thi'}
          </Button>
        </div>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-2 p-4">
            <p className="font-semibold">
              Phản hồi — HTTP {result.status} · {result.latencyMs}ms
            </p>
            <pre className="max-h-64 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
              {JSON.stringify(result.response, null, 2)}
            </pre>
          </Card>
          <Card className="space-y-2 p-4">
            <p className="font-semibold">cURL</p>
            <pre className="max-h-64 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-100">{result.curl}</pre>
            <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard.writeText(result.curl)}>
              Sao chép cURL
            </Button>
          </Card>
        </div>
      )}
    </ApiPageShell>
  );
}
