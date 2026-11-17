/**
 * Normalize PEM material from ENV/DB.
 * Admin sometimes stores raw SPKI/PKCS8 base64 without BEGIN/END headers —
 * OpenSSL then rejects the key and eSale response verify fails open with a warn.
 */
export function normalizePem(value?: string): string | undefined {
  if (!value) return undefined;
  const pem = value.replace(/\r\n/g, '\n').replace(/\\n/g, '\n').trim();
  if (!pem) return undefined;
  if (/BEGIN [A-Z0-9 ]+KEY/.test(pem)) {
    return pem;
  }
  const body = pem.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(body) || body.length < 64) {
    return pem;
  }
  // Short blobs are almost always SPKI public keys; longer ones PKCS8 private.
  const label = body.length > 800 ? 'PRIVATE KEY' : 'PUBLIC KEY';
  const lines = body.match(/.{1,64}/g) ?? [body];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}
