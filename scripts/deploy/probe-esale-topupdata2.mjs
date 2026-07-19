#!/usr/bin/env node
/** Brute common field names on cardshop/topupdata */
import { createDecipheriv, createHash, createPrivateKey, createSign } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
function sha256Hex(v){return createHash('sha256').update(v,'utf8').digest('hex');}
function rsaSign(raw, pem){const s=createSign('RSA-SHA256');s.update(raw,'utf8');s.end();return s.sign(createPrivateKey(pem),'base64');}
function deriveEncryptionKey(){return createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();}
function decryptSettingField(p){const [iv,t,d]=p.split(':');const dec=createDecipheriv('aes-256-gcm',deriveEncryptionKey(),Buffer.from(iv,'base64'));dec.setAuthTag(Buffer.from(t,'base64'));return Buffer.concat([dec.update(Buffer.from(d,'base64')),dec.final()]).toString('utf8');}
function fmt(d){const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;}
async function cfg(){
  const row=await prisma.systemSetting.findUnique({where:{key:'settings.provider.esale'}});
  const s=row?.value??{};
  return {
    cardApiUrl:`${(s.cardApiUrl??process.env.ESALE_API_URL_CARD).replace(/\/$/,'')}/`,
    agencyCode:s.agencyCode??process.env.ESALE_AGENCY_CODE,
    clientCode:s.clientCode??process.env.ESALE_CLIENT_CODE,
    secretKey:(s.secretKeyEnc?decryptSettingField(s.secretKeyEnc):undefined)??process.env.ESALE_SECRET_KEY,
    privateKeyPem:((s.privateKeyEnc?decryptSettingField(s.privateKeyEnc):undefined)??process.env.ESALE_PRIVATE_KEY??'').replace(/\\n/g,'\n').trim(),
  };
}
async function main(){
  const c=await cfg(); const now=new Date();
  const transId=`PROBE-TD2-${Date.now()}`; const phone='0985663225'; const time=Math.floor(now.getTime()/1000).toString();
  const transDate=fmt(now); const transactionDate=transDate;
  const sign=(parts)=>{const checkSum=sha256Hex([...parts,c.secretKey].join('|'));const signature=rsaSign(`${parts.join('|')}${c.secretKey}`,c.privateKeyPem);return {checkSum,signature};};
  const tries=[
    ['topup+packageCode', sign([c.agencyCode,transId,phone,12000,transDate,time]), {transId,agencyCode:c.agencyCode,clientCode:c.clientCode,phoneNumber:phone,telco:'viettel',amount:12000,packageCode:'DW12',transDate,time}],
    ['topup+cardCode', sign([c.agencyCode,transId,phone,12000,transDate,time]), {transId,agencyCode:c.agencyCode,clientCode:c.clientCode,phoneNumber:phone,telco:'viettel',amount:12000,cardCode:'DW12',transDate,time}],
    ['buycard-style', sign([c.agencyCode,transId,'VIETTEL3G',606,1,time]), {transId,agencyCode:c.agencyCode,clientCode:c.clientCode,supplierCode:'VIETTEL3G',cardId:606,quantity:1,phoneNumber:phone,transactionDate,time}],
    ['buycard-style transDate', sign([c.agencyCode,transId,'VIETTEL3G',606,1,time]), {transId,agencyCode:c.agencyCode,clientCode:c.clientCode,supplierCode:'VIETTEL3G',cardId:606,quantity:1,phoneNumber:phone,transDate,time}],
    ['phone+supplier+cardId topup sig', sign([c.agencyCode,transId,phone,'VIETTEL3G',606,transDate,time]), {transId,agencyCode:c.agencyCode,clientCode:c.clientCode,phoneNumber:phone,supplierCode:'VIETTEL3G',cardId:606,transDate,time}],
  ];
  for (const [label,sig,body] of tries){
    const res=await fetch(`${c.cardApiUrl}topupdata`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,...sig})});
    const payload=await res.json();
    console.log(JSON.stringify({label,retCode:payload.retCode,retMsg:payload.retMsg}));
  }
  for (const ep of ['topupcard3g','topup3gdata','topupcard','chargedata']){
    const sig=sign([c.agencyCode,transId,phone,12000,transDate,time]);
    const res=await fetch(`${c.cardApiUrl}${ep}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transId,agencyCode:c.agencyCode,clientCode:c.clientCode,phoneNumber:phone,telco:'viettel',amount:12000,packageCode:'DW12',supplierCode:'VIETTEL3G',cardId:606,transDate,time,...sig})});
    const text=await res.text();
    let payload; try{payload=JSON.parse(text);}catch{payload={retMsg:text.slice(0,60)}}
    console.log(JSON.stringify({endpoint:ep,retCode:payload.retCode,retMsg:payload.retMsg}));
  }
}
main().finally(()=>prisma.$disconnect());
