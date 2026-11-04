import fs from 'node:fs';

function peek(file) {
  if (!fs.existsSync(file)) return { file, exists: false };
  const text = fs.readFileSync(file, 'utf8');
  const get = (key) => {
    const match = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
    if (!match) return '';
    return match[1].trim().replace(/^['"]|['"]$/g, '');
  };
  const rawUrl = get('DATABASE_URL');
  let db = { host: 'missing', port: null };
  if (rawUrl) {
    try {
      const url = new URL(rawUrl.replace(/^postgresql:/, 'http:'));
      db = { host: url.hostname, port: url.port || '5432' };
    } catch {
      db = { host: 'unparsed', port: null };
    }
  }
  return {
    file,
    exists: true,
    dbHost: db.host,
    dbPort: db.port,
    encryptionKeyPresent: get('ENCRYPTION_KEY').length > 0,
    isLocalhost: db.host === 'localhost' || db.host === '127.0.0.1',
  };
}

console.log(JSON.stringify({ env: peek('.env'), production: peek('.env.production') }, null, 2));
