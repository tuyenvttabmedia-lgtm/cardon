/**
 * Refresh Airalo v2 package details (description, images, APN, activation)
 * for rows already in esim_airalo_packages. Does not change lifecycle.
 */
import { createDecipheriv, createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const NAMES = {
  JP: 'Nhật Bản',
  KR: 'Hàn Quốc',
  TH: 'Thái Lan',
  CN: 'Trung Quốc',
  TW: 'Đài Loan',
  SG: 'Singapore',
  MY: 'Malaysia',
  ID: 'Indonesia',
  PH: 'Philippines',
  HK: 'Hồng Kông',
  AU: 'Úc',
  US: 'Mỹ',
  IN: 'Ấn Độ',
  KH: 'Campuchia',
  GB: 'Anh',
  FR: 'Pháp',
  DE: 'Đức',
  IT: 'Italy',
  ES: 'Tây Ban Nha',
  CA: 'Canada',
  NZ: 'New Zealand',
  asia: 'Châu Á',
  europe: 'Châu Âu',
};

function decrypt(payload) {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error('ENCRYPTION_KEY is missing');
  const key = createHash('sha256').update(secret).digest();
  const [ivB64, tagB64, dataB64] = payload.split(':');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function imageUrl(value) {
  const url = value && typeof value === 'object' ? text(value.url) : '';
  return url.startsWith('https://') ? url : '';
}

function list(value) {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item)).filter(Boolean);
}

function activationLabel(policy) {
  const value = policy.toLowerCase();
  if (!value) return 'Theo hướng dẫn kèm mã cài';
  if (/first[-_ ]?us|on[-_ ]?usage|network|arriv|connect/.test(value)) {
    return 'Bắt đầu tính ngày khi eSIM kết nối mạng lần đầu tại điểm đến';
  }
  if (/install/.test(value)) return 'Bắt đầu tính ngày ngay khi cài eSIM lên máy';
  return policy;
}

function displayIso(destinationKey, countryIso) {
  if (destinationKey === 'asia') return 'ASIA';
  if (destinationKey === 'europe') return 'EUROPE';
  return String(countryIso || destinationKey).toUpperCase();
}

function collectPackages(body) {
  const countries = Array.isArray(body?.data) ? body.data : [];
  const out = [];
  for (const country of countries) {
    const countryIso = text(country.country_code || country.slug).toUpperCase();
    const countryImageUrl = imageUrl(country.image);
    for (const operator of country.operators || []) {
      const networks = [];
      const types = [];
      for (const coverage of operator.coverages || []) {
        for (const network of coverage.networks || [coverage]) {
          if (network?.name) networks.push(network.name);
          types.push(...list(network?.types));
        }
      }
      for (const pkg of operator.packages || []) {
        const id = text(pkg.id || pkg.package_id);
        if (!id) continue;
        out.push({
          id,
          title: text(pkg.title) || id,
          shortInfo: text(pkg.short_info),
          operatorTitle: text(operator.title) || 'Airalo',
          operatorInfo: list(operator.info),
          otherInfo: text(operator.other_info),
          countryImageUrl,
          operatorImageUrl: imageUrl(operator.image),
          activationPolicy: text(operator.activation_policy),
          apnType: text(operator.apn_type || pkg.apn_type),
          apnValue: text(operator.apn_value || pkg.apn_value),
          isRoaming: operator.is_roaming === true,
          rechargeable: operator.rechargeability === true,
          planType: text(operator.plan_type) || 'data',
          networks: [...new Set(networks)],
          networkTypes: [...new Set(types)],
          fairUsagePolicy: text(pkg.fair_usage_policy || operator.fair_usage_policy),
          countryIso,
        });
      }
    }
  }
  return out;
}

async function main() {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: 'settings.provider.airalo' },
  });
  const value = setting?.value || {};
  const clientId = value.clientIdEnc ? decrypt(value.clientIdEnc).trim() : '';
  const clientSecret = value.clientSecretEnc ? decrypt(value.clientSecretEnc).trim() : '';
  if (!clientId || !clientSecret) throw new Error('Airalo credentials are missing');
  const baseUrl = (value.baseUrl || 'https://partners-api.airalo.com').replace(/\/$/, '');

  const tokenRes = await fetch(`${baseUrl}/v2/token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });
  if (!tokenRes.ok) throw new Error(`Airalo token ${tokenRes.status}`);
  const tokenJson = await tokenRes.json();
  const token = tokenJson?.data?.access_token;
  if (!token) throw new Error('Airalo token empty');

  const remote = [];
  let page = 1;
  let last = 1;
  do {
    const res = await fetch(`${baseUrl}/v2/packages?limit=100&page=${page}&language=vi`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Airalo packages ${res.status}`);
    const body = await res.json();
    remote.push(...collectPackages(body));
    last = Number(body?.meta?.last_page) || 1;
    page += 1;
  } while (page <= last && page <= 50);

  const byId = new Map(remote.map((pkg) => [pkg.id, pkg]));
  const rows = await prisma.esimAiraloPackage.findMany({
    select: { id: true, providerPackageId: true, destinationKey: true, countryIso: true, variantId: true },
  });
  let updated = 0;
  for (const row of rows) {
    const pkg = byId.get(row.providerPackageId);
    if (!pkg) continue;
    await prisma.esimAiraloPackage.update({
      where: { id: row.id },
      data: {
        operatorTitle: pkg.operatorTitle.slice(0, 255),
        rawSafeMeta: {
          shortInfo: pkg.shortInfo,
          operatorInfo: pkg.operatorInfo,
          otherInfo: pkg.otherInfo,
          activationPolicy: pkg.activationPolicy,
          apnType: pkg.apnType,
          apnValue: pkg.apnValue,
          isRoaming: pkg.isRoaming,
          rechargeable: pkg.rechargeable,
          networks: pkg.networks,
          networkTypes: pkg.networkTypes,
          countryImageUrl: pkg.countryImageUrl,
          operatorImageUrl: pkg.operatorImageUrl,
          fairUsagePolicy: pkg.fairUsagePolicy,
        },
      },
    });
    if (row.variantId) {
      const countryIso = displayIso(row.destinationKey, row.countryIso);
      const current = await prisma.productVariant.findUnique({
        where: { id: row.variantId },
        select: { metadata: true, productId: true },
      });
      const catalogue = current?.metadata && typeof current.metadata === 'object' ? current.metadata.catalogue || {} : {};
      await prisma.productVariant.update({
        where: { id: row.variantId },
        data: {
          metadata: {
            catalogue: {
              ...catalogue,
              countryIso,
              countryName: NAMES[row.destinationKey] || NAMES[countryIso] || catalogue.countryName,
              providerDescription: pkg.shortInfo || pkg.title,
              shortInfo: pkg.shortInfo,
              operatorInfo: pkg.operatorInfo,
              otherInfo: pkg.otherInfo,
              activationPolicy: pkg.activationPolicy,
              activationLabel: activationLabel(pkg.activationPolicy),
              apnType: pkg.apnType,
              apnValue: pkg.apnValue,
              isRoaming: pkg.isRoaming,
              rechargeable: pkg.rechargeable,
              networks: pkg.networks,
              speed: pkg.networkTypes,
              operators: pkg.operatorTitle ? [pkg.operatorTitle] : catalogue.operators,
              countryImageUrl: pkg.countryImageUrl,
              operatorImageUrl: pkg.operatorImageUrl,
              fairUsagePolicy: pkg.fairUsagePolicy,
            },
          },
        },
      });
      if (pkg.countryImageUrl && current?.productId) {
        await prisma.product.update({
          where: { id: current.productId },
          data: { logoUrl: pkg.countryImageUrl },
        });
      }
    }
    updated += 1;
  }
  console.log(JSON.stringify({ remote: remote.length, updated }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
