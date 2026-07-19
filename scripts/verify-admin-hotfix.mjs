/** Smoke test admin endpoints — outputs status codes only. */
const BASE = process.env.ADMIN_BASE ?? 'http://admin.localhost';
const identifier = process.env.ADMIN_IDENTIFIER ?? 'superadmin@cardon.vn';
const password = process.env.ADMIN_PASSWORD ?? 'SuperAdmin2026!';

async function status(url, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(url, { headers });
  return res.status;
}

async function main() {
  const loginRes = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!loginRes.ok) {
    console.error('LOGIN', loginRes.status);
    process.exit(1);
  }
  const login = await loginRes.json();
  const token = login.data?.accessToken;
  if (!token) {
    console.error('LOGIN missing token');
    process.exit(1);
  }

  const paths = [
    `${BASE}/health`,
    `${BASE}/api/v1/admin/dashboard`,
    `${BASE}/api/v1/admin/orders`,
    `${BASE}/api/v1/admin/providers/status`,
    `${BASE}/api/v1/admin/settings/payment/runtime`,
    `${BASE}/api/v1/admin/settings/provider/esale`,
    `${BASE}/api/v1/admin/configuration/overview`,
    `${BASE}/api/v1/admin/webhooks/statistics`,
    `${BASE}/api/v1/admin/system/health`,
    `${BASE}/api/v1/admin/queues`,
  ];

  for (const url of paths) {
    const code = await status(url, token);
    console.log(`${code} ${url.replace(BASE, '')}`);
  }

  const statusRes = await fetch(`${BASE}/api/v1/admin/providers/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const statusJson = await statusRes.json();
  const providerId = statusJson.data?.[0]?.id;
  if (providerId) {
    const rtUrl = `${BASE}/api/v1/admin/providers/${providerId}/runtime-settings`;
    console.log(`${await status(rtUrl, token)} /api/v1/admin/providers/${providerId}/runtime-settings`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
