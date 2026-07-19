const BASE = process.env.BASE ?? 'http://nginx/api/v1';
const identifier = process.env.IDENTIFIER ?? 'agent@test.local';
const password = process.env.PASSWORD ?? 'LocalTest2026!';

async function main() {
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const login = await loginRes.json();
  if (!login.success) {
    console.error('LOGIN FAIL', loginRes.status, login);
    process.exit(1);
  }
  const token = login.data.accessToken;
  const headers = { Authorization: `Bearer ${token}` };

  const paths = [
    '/agents/me',
    '/agents/me/platform/session',
    '/agents/me/platform/dashboard',
  ];

  for (const p of paths) {
    const res = await fetch(`${BASE}${p}`, { headers });
    const text = await res.text();
    console.log(`${res.status} ${p} len=${text.length}`);
    if (res.status >= 400) console.log(text.slice(0, 300));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
