import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  filterEsimCatalogCategories,
  filterEsimCatalogProducts,
  filterStandardCatalogCategories,
  filterStandardCatalogProducts,
} from '@/types/api';

const adminRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const products = [
  { name: 'Garena', homeService: 'GAME_CARD', category: { homeService: 'GAME_CARD' } },
  { name: 'Viettel', homeService: 'PHONE_CARD', category: { homeService: 'PHONE_CARD' } },
  { name: 'Nap cuoc', homeService: 'TOPUP', category: { homeService: 'TOPUP' } },
  { name: 'Nap data', homeService: 'DATA', category: { homeService: 'DATA' } },
  { name: 'eSIM product', homeService: 'ESIM', status: 'ACTIVE', category: { homeService: 'ESIM' } },
  { name: 'eSIM via category', homeService: 'GAME_CARD', category: { homeService: 'ESIM' } },
];

const categories = [
  { name: 'Game', homeService: 'GAME_CARD', status: 'ACTIVE' },
  { name: 'Phone', homeService: 'PHONE_CARD', status: 'INACTIVE' },
  { name: 'Topup', homeService: 'TOPUP', status: 'ACTIVE' },
  { name: 'Data', homeService: 'DATA', status: 'ACTIVE' },
  { name: 'eSIM', homeService: 'ESIM', status: 'ACTIVE' },
  { name: 'eSIM off', homeService: 'ESIM', status: 'INACTIVE' },
];

describe('eSIM catalog admin filter', () => {
  it('removes eSIM products from the standard product screen', () => {
    expect(filterStandardCatalogProducts(products).map((product) => product.name)).toEqual([
      'Garena',
      'Viettel',
      'Nap cuoc',
      'Nap data',
    ]);
  });

  it('keeps CARD, TOPUP and DATA products', () => {
    const names = filterStandardCatalogProducts(products).map((product) => product.homeService);
    expect(names).toEqual(['GAME_CARD', 'PHONE_CARD', 'TOPUP', 'DATA']);
  });

  it('hides eSIM categories from the standard category picker', () => {
    expect(filterStandardCatalogCategories(categories, true).map((category) => category.name)).toEqual([
      'Game',
      'Topup',
      'Data',
    ]);
  });

  it('shows only eSIM products on the eSIM screen, including an ACTIVE catalog row', () => {
    const visible = filterEsimCatalogProducts(products);
    expect(visible.map((product) => product.name)).toEqual(['eSIM product', 'eSIM via category']);
    expect(visible[0]?.status).toBe('ACTIVE');
  });

  it('shows eSIM categories, including inactive ones, only on the eSIM screen', () => {
    expect(filterEsimCatalogCategories(categories).map((category) => category.name)).toEqual([
      'eSIM',
      'eSIM off',
    ]);
    expect(filterEsimCatalogCategories(categories, true).map((category) => category.name)).toEqual(['eSIM']);
  });

  it('does not treat catalog ACTIVE as a sales flag in the admin screens', () => {
    const esimPage = readFileSync(resolve(adminRoot, 'app/products/esim/page.tsx'), 'utf8');
    const productsPage = readFileSync(resolve(adminRoot, 'app/products/page.tsx'), 'utf8');
    expect(esimPage).toContain('filterEsimCatalogProducts');
    expect(esimPage).toContain('filterEsimCatalogCategories');
    expect(esimPage).not.toContain('customerEsimEnabled');
    expect(esimPage).not.toContain('ESIM_ENABLED');
    expect(esimPage).not.toContain('/admin/settings/system');
    expect(esimPage).not.toContain('metadata');
    expect(productsPage).toContain('filterStandardCatalogProducts(products)');
    expect(productsPage).toContain('filterStandardCatalogCategories(categories, true)');
    expect(productsPage).not.toContain("value: 'ESIM'");
  });

  it('keeps eSIM mapping picker on Airalo only', () => {
    const esimPage = readFileSync(resolve(adminRoot, 'app/products/esim/page.tsx'), 'utf8');
    expect(esimPage).toContain("ESIM_PROVIDER_CODES = new Set(['AIRALO'])");
    expect(esimPage).toContain('esimProviders.map');
    expect(esimPage).not.toContain('{providers.map((provider)');
  });
});
