/**
 * Read-only eSIM Go catalogue probe.
 * GET /catalogue only. Does not create an order, write a database, or print the API key.
 *
 *   $env:ESIM_GO_API_KEY = '<key>'
 *   node scripts/esim/read-catalogue.mjs
 */
const key = process.env.ESIM_GO_API_KEY ?? '';
if (key.trim() === '') {
  console.error('ESIM_GO_API_KEY is required');
  process.exit(2);
}

const base = (process.env.ESIM_GO_BASE_URL || 'https://api.esim-go.com/v2.5').replace(/\/$/, '');
const response = await fetch(`${base}/catalogue`, {
  method: 'GET',
  headers: {
    Accept: 'application/json',
    'X-API-Key': key,
  },
});

if (response.status < 200 || response.status >= 300) {
  console.error(`eSIM Go catalogue failed with status ${response.status}`);
  process.exit(1);
}

const body = await response.json();
const list = Array.isArray(body)
  ? body
  : body && typeof body === 'object' && Array.isArray(body.bundles)
    ? body.bundles
    : null;
if (!list) {
  console.error('eSIM Go catalogue response was not a list');
  process.exit(1);
}

const names = list
  .map((entry) => (entry && typeof entry.name === 'string' ? entry.name : ''))
  .filter(Boolean);

console.log(JSON.stringify({ count: names.length, names: names.slice(0, 20) }));
