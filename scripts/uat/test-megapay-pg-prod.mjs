/**
 * MegaPay PG production smoke test (no real charge).
 * Requires ENV: MEGAPAY_PG_MERCHANT_ID, MEGAPAY_PG_ENCODE_KEY, MEGAPAY_PG_REFUND_PASSWORD
 *
 * Usage: node scripts/uat/test-megapay-pg-prod.mjs
 */
import { createHash } from 'crypto';

const MER_ID = process.env.MEGAPAY_PG_MERCHANT_ID;
const ENCODE_KEY = process.env.MEGAPAY_PG_ENCODE_KEY;
const REFUND_PW = process.env.MEGAPAY_PG_REFUND_PASSWORD;
const DOMAIN = process.env.MEGAPAY_PG_DOMAIN || 'https://pg.megapay.vn';

if (!MER_ID || !ENCODE_KEY || !REFUND_PW) {
  console.error(
    'Missing MEGAPAY_PG_MERCHANT_ID / MEGAPAY_PG_ENCODE_KEY / MEGAPAY_PG_REFUND_PASSWORD',
  );
  process.exit(1);
}

function sha256(raw) {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

async function checkAsset(url) {
  const res = await fetch(url, { method: 'HEAD' });
  return { url, status: res.status, ok: res.ok };
}

async function trxStatus(merTrxId) {
  const timeStamp = String(Date.now());
  const merchantToken = sha256(`${timeStamp}${merTrxId}${MER_ID}${ENCODE_KEY}`);
  const body = new URLSearchParams({
    merId: MER_ID,
    merTrxId,
    timeStamp,
    merchantToken,
  });
  const res = await fetch(`${DOMAIN}/pg_was/order/trxStatus.do`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { rawText: text.slice(0, 500) };
  }
  return { http: res.status, json };
}

async function cancelProbe(merTrxId) {
  const timeStamp = String(Date.now());
  const trxId = 'MISSING';
  const amount = '1000';
  const payToken = '';
  const merchantToken = sha256(
    `${timeStamp}${merTrxId}${trxId}${MER_ID}${amount}${payToken}${ENCODE_KEY}`,
  );
  const hash = sha256(`${merTrxId}${REFUND_PW}${ENCODE_KEY}`);
  const body = new URLSearchParams({
    merId: MER_ID,
    merTrxId,
    trxId,
    amount,
    payType: 'QR',
    timeStamp,
    merchantToken,
    hash,
    refundData: REFUND_PW,
    cancelPw: REFUND_PW,
    cancelMsg: 'CardOn smoke cancel probe',
    cancelRetryCount: '0',
    fee: '0',
    vat: '0',
    notax: '0',
  });
  const res = await fetch(`${DOMAIN}/pg_was/cancel/paymentCancel.do`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { rawText: text.slice(0, 500) };
  }
  return { http: res.status, json };
}

const fakeMerTrxId = `${MER_ID}SMOKE${Date.now()}`;

const assets = await Promise.all([
  checkAsset(`${DOMAIN}/pg_was/js/payment/layer/paymentClient.js`),
  checkAsset(`${DOMAIN}/pg_was/css/payment/layer/paymentClient.css`),
]);
const status = await trxStatus(fakeMerTrxId);
const cancel = await cancelProbe(fakeMerTrxId);

const out = {
  merId: MER_ID,
  domain: DOMAIN,
  fakeMerTrxId,
  assets,
  trxStatus: {
    http: status.http,
    resultCd: status.json?.resultCd ?? null,
    resultMsg: status.json?.resultMsg ?? null,
    empty: !status.json || Object.keys(status.json).length === 0,
  },
  paymentCancel: {
    http: cancel.http,
    resultCd: cancel.json?.resultCd ?? null,
    resultMsg: cancel.json?.resultMsg ?? null,
  },
};

console.log(JSON.stringify(out, null, 2));

const assetsOk = assets.every((a) => a.ok);
const cancelCd = String(cancel.json?.resultCd ?? '');
// CC_112 = transaction not found → merchant auth + token/hash accepted
const cancelOk = cancel.http === 200 && cancelCd === 'CC_112';
if (!assetsOk || !cancelOk) {
  process.exitCode = 1;
}
