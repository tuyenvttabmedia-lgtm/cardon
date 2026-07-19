#!/usr/bin/env node
import { createDecipheriv, createHash, createPrivateKey, createSign } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
const prisma=new PrismaClient();
const sha=v=>createHash('sha256').update(v,'utf8').digest('hex');
const key=()=>createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
const dec=p=>{const [i,t,d]=p.split(':');const c=createDecipheriv('aes-256-gcm',key(),Buffer.from(i,'base64'));c.setAuthTag(Buffer.from(t,'base64'));return Buffer.concat([c.update(Buffer.from(d,'base64')),c.final()]).toString('utf8');};
const rsa=(r,pem)=>{const s=createSign('RSA-SHA256');s.update(r,'utf8');s.end();return s.sign(createPrivateKey(pem),'base64');};
const fmt=d=>{const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;};
async function cfg(){const row=await prisma.systemSetting.findUnique({where:{key:'settings.provider.esale'}});const s=row?.value??{};return{url:`${(s.cardApiUrl??process.env.ESALE_API_URL_CARD).replace(/\/$/,'')}/`,agency:s.agencyCode??process.env.ESALE_AGENCY_CODE,client:s.clientCode??process.env.ESALE_CLIENT_CODE,secret:(s.secretKeyEnc?dec(s.secretKeyEnc):undefined)??process.env.ESALE_SECRET_KEY,pem:((s.privateKeyEnc?dec(s.privateKeyEnc):undefined)??process.env.ESALE_PRIVATE_KEY??'').replace(/\\n/g,'\n').trim()};}
async function main(){
  const c=await cfg();const now=new Date();const transId=`P3-${Date.now()}`;const phone='0985663225';const time=Math.floor(now.getTime()/1000).toString();const transDate=fmt(now);
  const tries=[
    ['phone+supplier+cardId+date', [c.agency,transId,phone,'VIETTEL3G',606,transDate,time]],
    ['phone+supplier+cardId+time', [c.agency,transId,phone,'VIETTEL3G',606,time]],
    ['supplier+cardId+phone+date', [c.agency,transId,'VIETTEL3G',606,phone,transDate,time]],
    ['phone+cardCode+date', [c.agency,transId,phone,'DW12',transDate,time]],
    ['phone+cardId+date', [c.agency,transId,phone,606,transDate,time]],
  ];
  for(const [label,parts] of tries){
    const checkSum=sha([...parts,c.secret].join('|'));
    const signature=rsa(`${parts.join('|')}${c.secret}`,c.pem);
    const body={transId,agencyCode:c.agency,clientCode:c.client,phoneNumber:phone,supplierCode:'VIETTEL3G',cardId:606,cardCode:'DW12',transDate,time,checkSum,signature};
    const res=await fetch(`${c.url}topupdata`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const payload=await res.json();
    console.log(JSON.stringify({label,retCode:payload.retCode,retMsg:payload.retMsg}));
  }
}
main().finally(()=>prisma.$disconnect());
