import crypto from 'node:crypto';

const CONFIG = {
  pcode_register: '9000',
  key: '31feae316de0a42520ef5ec4',
  merchantCode: 'VAP001',
  bankCode: 'WOORIBANK',
  url: 'https://sandboxva.ecollect.vn:10003/ApiResf_VirtualAccount/services/registerVA',
};

function pkcs5Pad(buf, blockSize = 8) {
  const pad = blockSize - (buf.length % blockSize);
  return Buffer.concat([buf, Buffer.alloc(pad, pad)]);
}

function encrypt3desHex(plainText, keyStr) {
  const key = Buffer.from(keyStr, 'utf8');
  const data = pkcs5Pad(Buffer.from(plainText, 'utf8'), 8);
  const cipher = crypto.createCipheriv('des-ede3', key, null);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return encrypted.toString('hex');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function ymdHis(d = new Date()) {
  return (
    d.getFullYear() +
    pad2(d.getMonth() + 1) +
    pad2(d.getDate()) +
    pad2(d.getHours()) +
    pad2(d.getMinutes()) +
    pad2(d.getSeconds())
  );
}

function ymdEnd(monthsAhead = 6) {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsAhead);
  return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '235959';
}

const map_id = `${CONFIG.merchantCode}-${ymdHis().slice(0, 8)}_${Math.floor(100 + Math.random() * 900)}`;
const request_id = `${CONFIG.merchantCode}_RQID${ymdHis()}${Math.floor(100 + Math.random() * 900)}`;
const dataObj = {
  map_id,
  amount: 10000,
  start_date: ymdHis(),
  end_date: ymdEnd(6),
  condition: '01',
  customer_name: 'CARDON SANDBOX TEST',
  request_id,
  bank_code: CONFIG.bankCode,
  extend: {
    phone: '0987654321',
    email: 'sandbox@cardon.vn',
    address: 'Ha Noi',
    id: '1234567890',
  },
};

const dataEnc = encrypt3desHex(JSON.stringify(dataObj), CONFIG.key);
const body = {
  pcode: CONFIG.pcode_register,
  merchant_code: CONFIG.merchantCode,
  data: dataEnc,
};

console.log(JSON.stringify({ url: CONFIG.url, merchant: CONFIG.merchantCode, map_id, request_id }, null, 2));

const res = await fetch(CONFIG.url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log('HTTP', res.status);
console.log('BODY', text);
