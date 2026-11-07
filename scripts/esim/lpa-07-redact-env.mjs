import fs from 'node:fs';

const file = process.argv[2] || '.env.local-full';
if (!fs.existsSync(file)) {
  console.log(JSON.stringify({ file, exists: false }));
  process.exit(0);
}

const text = fs.readFileSync(file, 'utf8');
const get = (key) => {
  const match = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!match) return '';
  return match[1].trim().replace(/^['"]|['"]$/g, '');
};

const rawUrl = get('DATABASE_URL');
let dbHost = 'missing';
if (rawUrl) {
  try {
    dbHost = new URL(rawUrl.replace(/^postgresql:/, 'http:')).hostname;
  } catch {
    dbHost = 'unparsed';
  }
}

const airaloBase = get('AIRALO_BASE_URL');
let airaloHost = airaloBase ? 'invalid' : 'default-partners-api.airalo.com';
if (airaloBase) {
  try {
    airaloHost = new URL(airaloBase).host;
  } catch {
    airaloHost = 'invalid';
  }
}

console.log(
  JSON.stringify(
    {
      file,
      exists: true,
      esimEnabled: get('ESIM_ENABLED') || 'unset',
      providerMode: get('ESIM_PROVIDER_MODE') || 'unset',
      liveArm: get('ESIM_LIVE_ARM') || 'unset',
      airaloHost,
      airaloClientIdPresent: get('AIRALO_CLIENT_ID').length > 0,
      airaloClientSecretPresent: get('AIRALO_CLIENT_SECRET').length > 0,
      dbHost,
      paypalEsimEnabled: get('PAYPAL_ESIM_ENABLED') || 'unset',
    },
    null,
    2,
  ),
);
