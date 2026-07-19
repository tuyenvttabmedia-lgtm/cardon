'use client';

import { Card } from '@/components/ui/Card';
import { ApiPageShell } from '@/components/api/ApiSubNav';
import { getPartnerApiBaseUrl } from '@/lib/utils';

const partnerBase = getPartnerApiBaseUrl();

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

const curlProviders = `curl "${partnerBase}/providers" \\
  -H "X-API-KEY: YOUR_API_KEY" \\
  -H "X-REQUEST-ID: req-providers-001" \\
  -H "X-SIGNATURE: YOUR_HMAC_SIGNATURE"`;

const responseBuy = `{
  "request_id": "req-20250618-001",
  "status": "SUCCESS",
  "order_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "product_code": "GARENA_100K",
  "quantity": 1,
  "total_amount": "95000.00",
  "cards": [
    { "serial": "1234567890", "pin": "****5678", "expiry": "2027-12-31" }
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
      "product_code": "GARENA_100K",
      "name": "Garena 100K",
      "price": "95000.00",
      "currency": "VND",
      "provider": "esale"
    }
  ]
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
  const path = '/cards/buy';
  const body = JSON.stringify({
    product_code: 'GARENA_100K',
    quantity: 1,
    request_id: requestId,
  });
  const signature = sign('POST', path, requestId, body);

  const res = await fetch(baseUrl + path, {
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
            <code>X-API-KEY</code> — API key (prefix <code>ak_</code>)
          </li>
          <li>
            <code>X-REQUEST-ID</code> — Idempotency key (unique per request)
          </li>
          <li>
            <code>X-SIGNATURE</code> — HMAC-SHA256 của payload
          </li>
        </ul>
        <p className="mt-4 text-sm text-slate-600">
          Payload ký: <code>{'{METHOD}:{path}:{requestId}:{sha256(body)}'}</code>
        </p>
        <p className="mt-2 text-sm text-amber-700">
          Không gọi Partner API từ trình duyệt — secret key phải ở server backend của bạn.
        </p>
      </Card>

      <Card>
        <h2 className="font-semibold">Endpoints</h2>
        <div className="mt-4 space-y-3 text-sm">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="font-mono font-semibold">POST /cards/buy</p>
            <p className="mt-1 text-slate-600">Mua thẻ — body: product_code, quantity, request_id</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
            <p className="font-mono font-semibold">GET /balance</p>
            <p className="mt-1 text-slate-600">Xem available_balance, held_balance</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
            <p className="font-mono font-semibold">GET /transactions/:request_id</p>
            <p className="mt-1 text-slate-600">Tra cứu giao dịch — cards chỉ khi status SUCCESS</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
            <p className="font-mono font-semibold">GET /products</p>
            <p className="mt-1 text-slate-600">Danh sách SKU và giá agent được phép mua</p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
            <p className="font-mono font-semibold">GET /providers</p>
            <p className="mt-1 text-slate-600">Trạng thái provider đang active</p>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold">API Keys & Bảo mật</h2>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-700 dark:text-slate-300">
          <li>Tạo / xoay khóa tại <strong>Khóa API</strong> — prefix <code>ak_</code></li>
          <li>IP Whitelist: chỉ IP đã đăng ký mới gọi được Partner API</li>
          <li>Rate limit mặc định theo gói agent — xem tab <strong>Rate Limit</strong></li>
          <li>Webhook outbound: HMAC + header <code>X-CardOn-Version: v1</code></li>
        </ul>
      </Card>

      <Card>
        <h2 className="font-semibold">Định dạng Request / Response</h2>
        <p className="mt-2 text-sm text-slate-600">Content-Type: <code>application/json</code>. Mã lỗi nghiệp vụ nằm trong body (code, message).</p>
        <p className="mt-2 text-sm text-slate-600">HTTP 4xx/5xx kèm JSON — tra <strong>Mã lỗi</strong> để biết nguyên nhân và cách xử lý.</p>
      </Card>

      <Card>
        <h2 className="font-semibold">Idempotency & Best Practices</h2>
        <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-700 dark:text-slate-300">
          <li>Luôn dùng <code>X-REQUEST-ID</code> unique — retry cùng ID không tạo đơn trùng</li>
          <li>Chỉ tra cứu <code>/transactions/:request_id</code> khi buy trả PROCESSING</li>
          <li>Webhook <code>order.completed</code> v1 là nguồn callback chính thức</li>
          <li>Không log secret key / PIN ra file hoặc client</li>
        </ul>
      </Card>

      <CodeBlock title="cURL — Mua thẻ" code={curlBuy} />
      <CodeBlock title="Response — Mua thẻ (SUCCESS)" code={responseBuy} />
      <CodeBlock title="cURL — Số dư" code={curlBalance} />
      <CodeBlock title="Response — Số dư" code={responseBalance} />
      <CodeBlock title="cURL — Tra giao dịch" code={curlTransaction} />
      <CodeBlock title="cURL — Danh sách sản phẩm" code={curlProducts} />
      <CodeBlock title="Response — Sản phẩm" code={responseProducts} />
      <CodeBlock title="cURL — Providers" code={curlProviders} />
      <CodeBlock title="Node.js — Ví dụ ký & mua thẻ" code={nodeExample} />
      </div>
    </ApiPageShell>
  );
}
