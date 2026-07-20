import { createCipheriv, createDecipheriv, createVerify } from 'crypto';

/** PKCS#5 / PKCS#7 pad to 8-byte blocks (3DES). */
export function pkcs5Pad(data: Buffer, blockSize = 8): Buffer {
  const pad = blockSize - (data.length % blockSize);
  return Buffer.concat([data, Buffer.alloc(pad, pad)]);
}

/**
 * TripleDES ECB encrypt → lowercase hex (matches VNPT DemoPHP / DemoJava).
 */
export function encrypt3desHex(plainText: string, keyStr: string): string {
  const key = Buffer.from(keyStr, 'utf8');
  if (key.length !== 24) {
    throw new Error(`DepositCode 3DES key must be 24 bytes, got ${key.length}`);
  }
  const data = pkcs5Pad(Buffer.from(plainText, 'utf8'), 8);
  const cipher = createCipheriv('des-ede3', key, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('hex');
}

export function decrypt3desHex(cipherHex: string, keyStr: string): string {
  const key = Buffer.from(keyStr, 'utf8');
  const encrypted = Buffer.from(cipherHex, 'hex');
  const decipher = createDecipheriv('des-ede3', key, null);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
}

/**
 * Verify DepositCode notify signature (SHA256withRSA).
 * Canonical: RequestId|ReferenceId|RequestTime|Amount|Fee|VaAcc|MapId
 */
export function verifyDepositCodeNotifySignature(params: {
  requestId: string;
  referenceId: string;
  requestTime: string;
  amount: string | number;
  fee: string | number;
  vaAcc: string;
  mapId: string;
  signatureHex: string;
  publicKeyPem: string;
}): boolean {
  const canonical = [
    params.requestId,
    params.referenceId,
    params.requestTime,
    String(params.amount),
    String(params.fee),
    params.vaAcc,
    params.mapId,
  ].join('|');

  const signature = Buffer.from(params.signatureHex, 'hex');
  const verifier = createVerify('RSA-SHA256');
  verifier.update(canonical, 'utf8');
  verifier.end();
  try {
    return verifier.verify(params.publicKeyPem, signature);
  } catch {
    return false;
  }
}
