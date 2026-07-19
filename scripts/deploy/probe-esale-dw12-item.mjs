#!/usr/bin/env node
import { createDecipheriv, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
function sha256Hex(v){return createHash('sha256').update(v,'utf8').digest('hex');}
function deriveEncryptionKey(){return createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();}
function decryptSettingField(payload){
  const [ivB64, tagB64, dataB64]=payload.split(':');
  const decipher=createDecipheriv('aes-256-gcm', deriveEncryptionKey(), Buffer.from(ivB64,'base64'));
  decipher.setAuthTag(Buffer.from(tagB64,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64,'base64')), decipher.final()]).toString('utf8');
}
async function main(){
  const row=await prisma.systemSetting.findUnique({where:{key:'settings.provider.esale'}});
  const s=row?.value??{};
  const cardApiUrl=`${(s.cardApiUrl??process.env.ESALE_API_URL_CARD).replace(/\/$/,'')}/`;
  const agencyCode=s.agencyCode??process.env.ESALE_AGENCY_CODE;
  const clientCode=s.clientCode??process.env.ESALE_CLIENT_CODE;
  const secretKey=(s.secretKeyEnc?decryptSettingField(s.secretKeyEnc):undefined)??process.env.ESALE_SECRET_KEY;
  const time=Math.floor(Date.now()/1000).toString();
  const sig=sha256Hex(`${agencyCode}|${time}|${secretKey}`);
  const res=await fetch(`${cardApiUrl}getcardlist`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({agencyCode,clientCode,cardType:'Card3G',time,sig})});
  const payload=await res.json();
  const item=(payload.data?.info??[]).find(i=>i.supplierCode==='VIETTEL3G'&&i.cardId===606);
  console.log(JSON.stringify(item,null,2));
}
main().finally(()=>prisma.$disconnect());
