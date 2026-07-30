'use client';

import { Card } from '@/components/ui/Card';
import { ApiPageShell } from '@/components/api/ApiSubNav';
import { getPartnerApiBaseUrl } from '@/lib/utils';

const partnerBase = getPartnerApiBaseUrl();
/** Path used in HMAC (no leading slash) — must match AgentApiAuthGuard. */
const signBuyPath = 'api/partner/v1/cards/buy';
const signBalancePath = 'api/partner/v1/balance';

const curlBuy = `curl -X POST "${partnerBase}/cards/buy" \\
  -H "Content-Type: application/json" \\
  -H "X-API-KEY: YOUR_API_KEY" \\
  -H "X-REQUEST-ID: req-20250618-001" \\
  -H "X-SIGNATURE: YOUR_HMAC_SIGNATURE" \\
  -d '{"product_code":"GARENA_100K","quantity":1,"request_id":"req-20250618-001"}'`;

const curlBalance = `curl "${partnerBase}/balance" \\
  -H "X-API-KEY: YOUR_API_KEY" \\
  -H "X-REQUEST-ID: req-balance-001" \\
  -H "X-SIGNATURE: YOUR_HMAC_SIGNATURE"`;

const curlTransaction = `curl "${partnerBase}/transactions/req-20250618-001" \\
  -H "X-API-KEY: YOUR_API_KEY" \\
  -H "X-REQUEST-ID: req-txn-lookup-001" \\
  -H "X-SIGNATURE: YOUR_HMAC_SIGNATURE"`;

const curlProducts = `curl "${partnerBase}/products" \\
  -H "X-API-KEY: YOUR_API_KEY" \\
  -H "X-REQUEST-ID: req-products-001" \\
  -H "X-SIGNATURE: YOUR_HMAC_SIGNATURE"`;

const responseBuy = `{
  "request_id": "req-20250618-001",
  "status": "SUCCESS",
  "product_code": "GARENA_100K",
  "quantity": 1,
  "amount": "95000.00",
  "cards": [
    { "card_serial": "1234567890", "card_pin": "ABCD1234" }
  ]
}`;

const responseBalance = `{
  "available_balance": "1500000.00",
  "held_balance": "50000.00",
  "currency": "VND"
}`;

const responseProducts = `{
  "items": [
    {
      "product_code": "VIETTEL_10K",
      "name": "Viettel 10K",
      "category": "Thẻ điện thoại Viettel",
      "face_value": "10000.00",
      "agent_price": "9800.00",
      "status": "ACTIVE"
    }
  ]
}`;

const webhookPayload = `{
  "version": "v1",
  "event": "order.completed",
  "request_id": "req-20250618-001",
  "order_id": "uuid",
  "partner_order_id": "req-20250618-001",
  "status": "SUCCESS",
  "product": "GARENA_100K",
  "amount": "95000.00",
  "created_at": "2026-07-28T10:00:00.000Z",
  "completed_at": "2026-07-28T10:00:01.000Z",
  "gateway": "wallet",
  "serial": "1234567890",
  "pin": "ABCD1234",
  "environment": "SANDBOX"
}`;

const nodeExample = `import crypto from 'crypto';

const apiKey = process.env.CARDON_API_KEY!;
const secretKey = process.env.CARDON_SECRET_KEY!;
const baseUrl = '${partnerBase}';

function sign(method, path, requestId, body = '') {
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const payload = \`\${method.toUpperCase()}:\${path}:\${requestId}:\${bodyHash}\`;
  return crypto.createHmac('sha256', secretKey).update(payload).digest('hex');
}

async function buyCard() {
  const requestId = 'req-' + Date.now();
  const signPath = '${signBuyPath}';
  const body = JSON.stringify({
    product_code: 'GARENA_100K',
    quantity: 1,
    request_id: requestId,
  });
  const signature = sign('POST', signPath, requestId, body);

  const res = await fetch(baseUrl + '/cards/buy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
      'X-REQUEST-ID': requestId,
      'X-SIGNATURE': signature,
    },
    body,
  });
  return res.json();
}

async function getBalance() {
  const requestId = 'req-bal-' + Date.now();
  const signature = sign('GET', '${signBalancePath}', requestId, '');
  const res = await fetch(baseUrl + '/balance', {
    headers: {
      'X-API-KEY': apiKey,
      'X-REQUEST-ID': requestId,
      'X-SIGNATURE': signature,
    },
  });
  return res.json();
}`;

function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <Card>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
        <code>{code}</code>
      </pre>
    </Card>
  );
}

export default function DocsPanel() {
  return (
    <ApiPageShell
      title="Tài liệu API"
      description={`Base URL: ${partnerBase}`}
    >
      <div className="mx-auto max-w-4xl space-y-6">
      <Card>
        <h2 className="font-semibold">Xác thực</h2>
        <p className="mt-2 text-sm text-slate-600">Mọi request cần 3 header:</p>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-700">
          <li>
            <code>X-API-KEY</code> — <code>ak_test_</code> (sandbox) hoặc <code>ak_live_</code> / legacy <code>ak_</code> (production)
          </li>
          <li>
            <code>X-REQUEST-ID</code> — idempotency key (với buy phải khớp <code>request_id</code> trong body)
          </li>
          <li>
            <code>X-SIGNATURE</code> — HMAC-SHA256 hex của payload ký
          </li>
        </ul>
        <p className="mt-4 text-sm text-slate-600">
          Payload ký: <code>{'{METHOD}:{path}:{requestId}:{sha256(body)}'}</code>
        </p>
        <p className="mt-2 text-sm text-slate-600">
          <code>path</code> ký <strong>không</strong> có dấu <code>/</code> đầu — ví dụ{' '}
          <code>{signBuyPath}</code>
        </p>
        <p className="mt-2 text-sm text-amber-700">
          Không gọi Partner API từ trình duyệt — secret key phải ở server backend của bạn.
        </p>
      </Card>

      <Card>
        <h2 className="font-semibold">Sandbox vs Production</h2>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-700">
          <li>Sau KYC duyệt: nhận khóa <code>ak_test_</code> + hạn mức sandbox (không đụng tiền/hàng thật)</li>
          <li>Khóa live chỉ bật sau khi pass UAT sandbox (invite-only)</li>
          <li>Cùng base URL; môi trường phân biệt bằng prefix key</li>
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold">Endpoints</h2>
        <div className="mt-4 space-y-3 text-sm">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-mono font-semibold">POST /cards/buy</p>
            <p className="mt-1 text-slate-600">Mua thẻ — body: product_code, quantity, request_id</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-mono font-semibold">GET /balance</p>
            <p className="mt-1 text-slate-600">available_balance, held_balance theo môi trường của key</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-mono font-semibold">GET /transactions/:request_id</p>
            <p className="mt-1 text-slate-600">Tra cứu — cards chỉ khi status SUCCESS</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-mono font-semibold">GET /products</p>
            <p className="mt-1 text-slate-600">
              Toàn bộ SKU ACTIVE + face_value + agent_price đã resolve
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold">Webhook outbound</h2>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-700">
          <li>Cấu hình URL + secret tại tab <strong>Webhook</strong></li>
          <li>Events: <code>order.completed</code>, <code>order.failed</code></li>
          <li>Headers: <code>X-CardOn-Signature</code>, <code>X-CardOn-Timestamp</code>, <code>X-CardOn-Event</code>, <code>X-CardOn-Version: v1</code></li>
          <li>Ký: HMAC-SHA256 của <code>timestamp.rawBody</code> bằng webhook secret (khác API secret)</li>
          <li>Retry tối đa 5 lần (0 / 1m / 5m / 15m / 30m)</li>
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold">Idempotency & lỗi</h2>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-700">
          <li>Retry cùng <code>request_id</code> → HTTP 200 + kết quả gốc (không 409)</li>
          <li>HTTP 4xx/5xx: <code>{`{ success: false, error: { code, message } }`}</code></li>
          <li>Lỗi nghiệp vụ sau khi nhận đơn: HTTP 200 + <code>status: FAILED</code> + <code>error</code></li>
        </ul>
      </Card>

      <CodeBlock title="cURL — Mua thẻ" code={curlBuy} />
      <CodeBlock title="Response — Mua thẻ (SUCCESS)" code={responseBuy} />
      <CodeBlock title="cURL — Số dư" code={curlBalance} />
      <CodeBlock title="Response — Số dư" code={responseBalance} />
      <CodeBlock title="cURL — Tra giao dịch" code={curlTransaction} />
      <CodeBlock title="cURL — Danh sách sản phẩm" code={curlProducts} />
      <CodeBlock title="Response — Sản phẩm" code={responseProducts} />
      <CodeBlock title="Webhook payload — order.completed" code={webhookPayload} />
      <CodeBlock title="Node.js — Ví dụ ký & mua thẻ" code={nodeExample} />
      </div>
    </ApiPageShell>
  );
}
