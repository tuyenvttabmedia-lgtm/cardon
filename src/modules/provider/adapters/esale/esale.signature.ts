import {
  createHash,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  privateDecrypt,
  constants,
} from 'crypto';
import { EsalePurchasedCard } from './esale.types';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function signBuyCardRequest(params: {
  agencyCode: string;
  transId: string;
  supplierCode: string;
  cardId: number;
  quantity: number;
  time: string;
  secretKey: string;
  privateKeyPem: string;
}): { checkSum: string; signature: string; rawData: string } {
  const checkSum = sha256Hex(
    `${params.agencyCode}|${params.transId}|${params.supplierCode}|${params.cardId}|${params.quantity}|${params.time}|${params.secretKey}`,
  );
  const rawData = `${params.agencyCode}|${params.transId}|${params.supplierCode}|${params.cardId}|${params.quantity}|${params.time}${params.secretKey}`;
  const signature = rsaSign(rawData, params.privateKeyPem);
  return { checkSum, signature, rawData };
}

export function signCheckTransactionRequest(params: {
  agencyCode: string;
  transId: string;
  isGetCard: number;
  time: string;
  secretKey: string;
  privateKeyPem: string;
}): { checkSum: string; signature: string } {
  const checkSum = sha256Hex(
    `${params.agencyCode}|${params.transId}|${params.isGetCard}|${params.time}|${params.secretKey}`,
  );
  const rawData = `${params.agencyCode}|${params.transId}|${params.isGetCard}|${params.time}${params.secretKey}`;
  const signature = rsaSign(rawData, params.privateKeyPem);
  return { checkSum, signature };
}

export function signGetCardListRequest(params: {
  agencyCode: string;
  time: string;
  secretKey: string;
}): string {
  return sha256Hex(`${params.agencyCode}|${params.time}|${params.secretKey}`);
}

export function signGetBalanceCardRequest(params: {
  transId: string;
  agencyCode: string;
  time: string;
  secretKey: string;
}): string {
  return sha256Hex(
    `${params.transId}|${params.agencyCode}|${params.time}|${params.secretKey}`,
  );
}

export function signTopupRequest(params: {
  agencyCode: string;
  transId: string;
  phoneNumber: string;
  amount: number;
  transDate: string;
  time: string;
  secretKey: string;
  privateKeyPem: string;
}): { checkSum: string; signature: string } {
  const checkSum = sha256Hex(
    `${params.agencyCode}|${params.transId}|${params.phoneNumber}|${params.amount}|${params.transDate}|${params.time}|${params.secretKey}`,
  );
  const rawData = `${params.agencyCode}|${params.transId}|${params.phoneNumber}|${params.amount}|${params.transDate}|${params.time}${params.secretKey}`;
  const signature = rsaSign(rawData, params.privateKeyPem);
  return { checkSum, signature };
}

export function signTopupCheckTransactionRequest(params: {
  agencyCode: string;
  transId: string;
  transDate: string;
  time: string;
  secretKey: string;
}): string {
  return sha256Hex(
    `${params.agencyCode}|${params.transId}|${params.transDate}|${params.time}|${params.secretKey}`,
  );
}

export function signTopupGetBalanceRequest(params: {
  agencyCode: string;
  time: string;
  secretKey: string;
}): string {
  return sha256Hex(`${params.agencyCode}|${params.time}|${params.secretKey}`);
}

/** cardshop/topupdata — direct Card3G package to phone */
export function signTopupDataRequest(params: {
  agencyCode: string;
  transId: string;
  supplierCode: string;
  cardId: number;
  phoneNumber: string;
  transDate: string;
  time: string;
  secretKey: string;
  privateKeyPem: string;
}): { checkSum: string; signature: string } {
  const checkSum = sha256Hex(
    `${params.agencyCode}|${params.transId}|${params.supplierCode}|${params.cardId}|${params.phoneNumber}|${params.transDate}|${params.time}|${params.secretKey}`,
  );
  const rawData = `${params.agencyCode}|${params.transId}|${params.supplierCode}|${params.cardId}|${params.phoneNumber}|${params.transDate}|${params.time}${params.secretKey}`;
  const signature = rsaSign(rawData, params.privateKeyPem);
  return { checkSum, signature };
}

export function buildResponseVerifyPayload(params: {
  retCode: number;
  transId: string;
  time: string;
  cards?: EsalePurchasedCard[];
}): string {
  if (params.retCode === 1 && params.cards?.length) {
    const cardString = params.cards
      .map((card) => `${card.serial}${card.cardCode}${card.expiredDate}`)
      .join('');
    return `${params.retCode}|${params.transId}|${params.time}|${cardString}`;
  }
  return `${params.retCode}|${params.transId}|${params.time}`;
}

export function verifyEsaleResponseSignature(params: {
  payload: string;
  signature: string;
  publicKeyPem: string;
}): boolean {
  if (!params.signature || !params.publicKeyPem) {
    return false;
  }
  try {
    const verifier = createVerify('RSA-SHA256');
    verifier.update(params.payload, 'utf8');
    verifier.end();
    return verifier.verify(
      createPublicKey(params.publicKeyPem),
      params.signature,
      'base64',
    );
  } catch {
    return false;
  }
}

export function rsaSign(rawData: string, privateKeyPem: string): string {
  const signer = createSign('RSA-SHA256');
  signer.update(rawData, 'utf8');
  signer.end();
  return signer.sign(createPrivateKey(privateKeyPem), 'base64');
}

export function decryptCardPin(
  encryptedCardCode: string,
  privateKeyPem: string,
): string {
  const normalized = encryptedCardCode.replace(/\s+/g, '');
  const buffer = Buffer.from(normalized, 'base64');
  const decrypted = privateDecrypt(
    {
      key: createPrivateKey(privateKeyPem),
      padding: constants.RSA_PKCS1_PADDING,
    },
    buffer,
  );
  return decrypted.toString('utf8');
}
