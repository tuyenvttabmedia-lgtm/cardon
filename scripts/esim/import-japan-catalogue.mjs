/**
 * Map Japan bundles from GET /catalogue?countries=JP into local products.
 * Wholesale on the bundle is USD. Sell price is that amount converted with a
 * published USDVND rate and rounded up to 1,000 VND. No CardOn margin.
 * Does not place an order.
 */
const { createDecipheriv, createHash } = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const FX_URL = 'https://open.er-api.com/v6/latest/USD';

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

function dataLabel(bundle) {
  if (bundle.unlimited || bundle.dataAmount < 0) return 'không giới hạn';
  if (bundle.dataAmount % 1000 === 0) return `${bundle.dataAmount / 1000} GB`;
  return `${bundle.dataAmount} MB`;
}

function tier(group) {
  if (group === 'Standard Unlimited Lite') return 'Lite';
  if (group === 'Standard Unlimited Essential') return 'Essential';
  if (group === 'Standard Unlimited Plus') return 'Plus';
  return '';
}

function titleOf(bundle) {
  const group = Array.isArray(bundle.groups) ? bundle.groups[0] : '';
  const extra = tier(group);
  const data = dataLabel(bundle);
  return extra
    ? `Nhật Bản ${data} ${extra} / ${bundle.duration} ngày`
    : `Nhật Bản ${data} / ${bundle.duration} ngày`;
}

function operatorsOf(bundle) {
  const rows = Array.isArray(bundle.countryNetworks) ? bundle.countryNetworks : [];
  const names = [];
  for (const row of rows) {
    const networks = Array.isArray(row.networks) ? row.networks : [];
    for (const network of networks) {
      const name = network && (network.name || network.brandName);
      if (name && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

function sellVnd(priceUsd, usdVnd) {
  return Math.ceil((priceUsd * usdVnd) / 1000) * 1000;
}

async function main() {
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'settings.provider.esim_go' } });
  const enc = setting && setting.value && setting.value.apiKeyEnc;
  if (!enc) throw new Error('eSIM Go token is not saved');
  const apiKey = decrypt(enc).trim();
  const headers = { Accept: 'application/json', 'X-API-Key': apiKey };
  const catalogueResponse = await fetch('https://api.esim-go.com/v2.5/catalogue?countries=JP&perPage=100&page=1', { headers });
  if (!catalogueResponse.ok) throw new Error(`catalogue status ${catalogueResponse.status}`);
  const catalogue = await catalogueResponse.json();
  const bundles = Array.isArray(catalogue.bundles) ? catalogue.bundles : [];
  if (bundles.length === 0) throw new Error('Japan catalogue is empty');

  const fxResponse = await fetch(FX_URL);
  if (!fxResponse.ok) throw new Error(`fx status ${fxResponse.status}`);
  const fx = await fxResponse.json();
  const usdVnd = fx && fx.rates && fx.rates.VND;
  if (typeof usdVnd !== 'number' || usdVnd < 10000) throw new Error('USDVND rate is missing');

  const provider = await prisma.provider.findFirst({ where: { code: 'ESIM_GO', deletedAt: null } });
  if (!provider) throw new Error('ESIM_GO provider is missing');

  await prisma.product.updateMany({
    where: { slug: 'esim-nhat-1gb-7-ngay' },
    data: { status: 'INACTIVE' },
  });

  const category = await prisma.productCategory.upsert({
    where: { slug: 'esim-du-lich' },
    create: { slug: 'esim-du-lich', name: 'eSIM du lịch', homeService: 'ESIM', status: 'ACTIVE' },
    update: { homeService: 'ESIM', status: 'ACTIVE' },
  });

  const product = await prisma.product.upsert({
    where: { slug: 'esim-nhat-ban' },
    create: {
      categoryId: category.id,
      homeService: 'ESIM',
      slug: 'esim-nhat-ban',
      name: 'eSIM Nhật Bản',
      description: 'Các gói Nhật Bản từ catalogue eSIM Go. Mô tả chữ của API là nhãn ngắn. Dung lượng, thời hạn, tốc độ và nhà mạng lấy từ trường cấu trúc.',
      status: 'ACTIVE',
    },
    update: {
      categoryId: category.id,
      homeService: 'ESIM',
      name: 'eSIM Nhật Bản',
      status: 'ACTIVE',
      deletedAt: null,
    },
  });

  const mapped = [];
  for (const bundle of bundles) {
    if (typeof bundle.name !== 'string' || typeof bundle.price !== 'number') continue;
    const sku = bundle.name.toUpperCase();
    const priceVnd = sellVnd(bundle.price, usdVnd);
    const country = Array.isArray(bundle.countries) ? bundle.countries[0] : null;
    const group = Array.isArray(bundle.groups) ? bundle.groups[0] : '';
    const metadata = {
      catalogue: {
        publicSlug: bundle.name.toLowerCase().replaceAll('_', '-'),
        bundleName: bundle.name,
        providerDescription: typeof bundle.description === 'string' ? bundle.description : '',
        countryIso: country && country.iso ? country.iso : 'JP',
        countryName: country && country.name ? country.name : 'Japan',
        dataAmountMb: bundle.dataAmount,
        duration: bundle.duration,
        durationUnit: bundle.durationUnit,
        unlimited: bundle.unlimited === true || bundle.dataAmount < 0,
        speed: Array.isArray(bundle.speed) ? bundle.speed : [],
        operators: operatorsOf(bundle),
        group,
        priceUsd: bundle.price,
        fx: {
          usdVnd,
          source: FX_URL,
          updatedAt: fx.time_last_update_utc ?? null,
        },
      },
    };
    const variant = await prisma.productVariant.upsert({
      where: { sku },
      create: {
        productId: product.id,
        sku,
        name: titleOf(bundle),
        type: 'ESIM',
        faceValue: priceVnd,
        sellPrice: priceVnd,
        status: 'ACTIVE',
        metadata,
      },
      update: {
        productId: product.id,
        name: titleOf(bundle),
        type: 'ESIM',
        faceValue: priceVnd,
        sellPrice: priceVnd,
        status: 'ACTIVE',
        deletedAt: null,
        metadata,
      },
    });
    const existing = await prisma.providerProductMapping.findFirst({
      where: { providerId: provider.id, productVariantId: variant.id, providerProductCode: bundle.name },
    });
    if (existing) {
      await prisma.providerProductMapping.update({
        where: { id: existing.id },
        data: {
          providerCost: priceVnd,
          status: 'ACTIVE',
          availability: 'AVAILABLE',
        },
      });
    } else {
      await prisma.providerProductMapping.create({
        data: {
          providerId: provider.id,
          productVariantId: variant.id,
          providerProductCode: bundle.name,
          providerCost: priceVnd,
          status: 'ACTIVE',
          availability: 'AVAILABLE',
        },
      });
    }
    mapped.push({ name: bundle.name, priceUsd: bundle.price, priceVnd, description: bundle.description });
  }

  console.log(JSON.stringify({
    bundles: mapped.length,
    usdVnd,
    sample: mapped[0],
    salesUnchanged: true,
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'import failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
