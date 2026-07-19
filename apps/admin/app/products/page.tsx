'use client';



import { useEffect, useMemo, useState } from 'react';

import { RequirePermission } from '@/components/layout/AdminShell';

import { Badge, Card, ErrorMessage, statusTone } from '@/components/ui/Display';

import { Button, Input, Label, Select } from '@/components/ui/Form';

import { useToast } from '@/components/ui/Toast';

import { slugify } from '@/lib/slugify';

import { vi } from '@/lib/i18n/vi';

import { productAdminApi, adminApi, ApiClientError } from '@/services/api-client';

import { formatVnd } from '@/lib/utils';

import { MediaImageField } from '@/components/marketing/MediaImageField';

import type { Category, HomeServiceType, Product, ProviderMapping, ProviderStatus } from '@/types/api';



type Tab = 'product' | 'variant' | 'mapping';

type StatusFilter = 'active' | 'inactive' | 'all';

const HOME_SERVICE_OPTIONS: Array<{ value: HomeServiceType; label: string }> = [
  { value: 'GAME_CARD', label: 'Thẻ game (GAME_CARD)' },
  { value: 'PHONE_CARD', label: 'Thẻ điện thoại (PHONE_CARD)' },
  { value: 'TOPUP', label: 'Nạp cước (TOPUP)' },
  { value: 'DATA', label: 'Nạp Data (DATA)' },
];

function homeServiceLabel(homeService?: HomeServiceType | null) {
  return HOME_SERVICE_OPTIONS.find((o) => o.value === homeService)?.label ?? '—';
}

function variantTypesForHomeService(homeService?: HomeServiceType | null): string[] {
  switch (homeService) {
    case 'GAME_CARD':
    case 'PHONE_CARD':
      return ['CARD'];
    case 'TOPUP':
      return ['TOPUP'];
    case 'DATA':
      return ['DATA'];
    default:
      return ['CARD', 'TOPUP', 'DATA'];
  }
}

function categoryOptionLabel(category: Category) {
  const service = category.homeService ? `[${category.homeService}] ` : '';
  return `${service}${category.name}`;
}



const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU_PATTERN = /^[A-Z0-9_]+$/;

const EMPTY_VARIANT = {
  sku: '',
  name: '',
  type: 'CARD',
  faceValue: '100000',
  sellPrice: '99000',
  packageName: '',
  capacity: '',
  duration: '',
};



export default function ProductsPage() {

  const toast = useToast();

  const [tab, setTab] = useState<Tab>('product');

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  const [categories, setCategories] = useState<Category[]>([]);

  const [products, setProducts] = useState<Product[]>([]);

  const [providers, setProviders] = useState<ProviderStatus[]>([]);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [selectedVariantId, setSelectedVariantId] = useState('');

  const [mappings, setMappings] = useState<ProviderMapping[]>([]);

  const [error, setError] = useState<string | null>(null);

  const [newCat, setNewCat] = useState({ slug: '', name: '', slugManual: false, homeService: 'GAME_CARD' as HomeServiceType });

  const [newProduct, setNewProduct] = useState({ categoryId: '', slug: '', name: '', slugManual: false });

  const [newVariant, setNewVariant] = useState(EMPTY_VARIANT);

  const [newMapping, setNewMapping] = useState({

    providerId: '',

    providerProductCode: '',

    providerCost: '',

    priority: '1',

  });

  const [editMapping, setEditMapping] = useState<{
    id: string;
    providerProductCode: string;
    providerCost: string;
    priority: string;
  } | null>(null);

  const [editCat, setEditCat] = useState<{ id: string; name: string; iconUrl?: string | null } | null>(null);

  const [editProduct, setEditProduct] = useState<{
    id: string;
    name: string;
    categoryId: string;
    logoUrl?: string | null;
    bannerUrl?: string | null;
  } | null>(null);

  const selectedProductHomeService = useMemo(() => {
    if (!selectedProduct) return null;
    const fromProduct = selectedProduct.homeService ?? selectedProduct.category?.homeService;
    if (fromProduct) return fromProduct;
    const cat = categories.find((c) => c.id === selectedProduct.categoryId);
    return cat?.homeService ?? null;
  }, [selectedProduct, categories]);

  const allowedVariantTypes = useMemo(
    () => variantTypesForHomeService(selectedProductHomeService),
    [selectedProductHomeService],
  );

  const [editVariant, setEditVariant] = useState<{

    id: string;

    name: string;

    type: string;

    faceValue: string;

    sellPrice: string;

    packageName: string;

    capacity: string;

    duration: string;

  } | null>(null);



  const selectedVariantForMapping = useMemo(() => {
    for (const p of products) {
      const match = p.variants?.find((v) => v.id === selectedVariantId);
      if (match) return match;
    }
    return null;
  }, [products, selectedVariantId]);

  const mappingCodePlaceholder =
    selectedVariantForMapping?.type === 'TOPUP'
      ? 'VD: VIETTEL_TOPUP_10000'
      : selectedVariantForMapping?.type === 'DATA'
        ? 'VD: VIETTEL_DATA_ST15K'
        : 'VD: VIETTEL:35';

  const mappingCodeHelp =
    selectedVariantForMapping?.type === 'TOPUP'
      ? vi.products.mappingTopupHelp
      : selectedVariantForMapping?.type === 'DATA'
        ? vi.products.mappingDataHelp
        : vi.products.mappingCardHelp;



  async function load() {

    try {

      const [cats, prods, provs] = await Promise.all([

        productAdminApi.listCategories(),

        productAdminApi.listProductsFiltered(statusFilter),

        adminApi.getProvidersStatus(),

      ]);

      setCategories(cats);

      setProducts(prods);

      setProviders(provs);

      if (selectedProduct) {

        const updated = prods.find((p) => p.id === selectedProduct.id) ?? null;

        setSelectedProduct(updated);

        if (updated && selectedVariantId) {
          await loadMappings(selectedVariantId);
        }

      }

    } catch (err) {

      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);

    }

  }



  useEffect(() => {

    void load();

  }, [statusFilter]);



  async function loadMappings(variantId: string) {
    setSelectedVariantId(variantId);
    setMappings(await productAdminApi.listProviderMappings(variantId));
  }



  async function softDelete(action: () => Promise<unknown>) {

    if (!window.confirm(vi.products.deleteConfirm)) return;

    await action();

    toast.success(vi.app.saved);

    await load();

  }



  async function hardDelete(action: () => Promise<unknown>) {

    if (!window.confirm(vi.products.hardDeleteConfirm)) return;

    try {

      await action();

      toast.success(vi.products.hardDelete);

      await load();

    } catch (err) {

      toast.error(err instanceof ApiClientError ? err.message : vi.app.requestFailed);

    }

  }



  function updateCatName(name: string) {

    setNewCat((prev) => ({

      ...prev,

      name,

      slug: prev.slugManual ? prev.slug : slugify(name),

    }));

  }



  function updateProductName(name: string) {

    setNewProduct((prev) => ({

      ...prev,

      name,

      slug: prev.slugManual ? prev.slug : slugify(name),

    }));

  }



  async function createCategory() {

    const slug = newCat.slug.trim();

    if (!SLUG_PATTERN.test(slug)) {

      toast.error(vi.products.slugInvalid);

      return;

    }

    try {

      await productAdminApi.createCategory({
        slug,
        name: newCat.name.trim(),
        homeService: newCat.homeService,
      });

      setNewCat({ slug: '', name: '', slugManual: false, homeService: 'GAME_CARD' });

      toast.success(vi.app.saved);

      await load();

    } catch (err) {

      toast.error(err instanceof ApiClientError ? err.message : vi.products.createCategoryError);

    }

  }



  async function createProduct() {

    const slug = newProduct.slug.trim();

    if (!SLUG_PATTERN.test(slug)) {

      toast.error(vi.products.slugInvalid);

      return;

    }

    if (!newProduct.categoryId) return;

    try {

      await productAdminApi.createProduct({

        categoryId: newProduct.categoryId,

        slug,

        name: newProduct.name.trim(),

      });

      setNewProduct({ categoryId: '', slug: '', name: '', slugManual: false });

      toast.success(vi.app.saved);

      await load();

    } catch (err) {

      toast.error(err instanceof ApiClientError ? err.message : vi.products.createProductError);

    }

  }



  async function createVariant() {

    if (!selectedProduct) return;

    const sku = newVariant.sku.trim().toUpperCase();

    const name = newVariant.name.trim();

    if (!SKU_PATTERN.test(sku)) {

      toast.error('SKU chỉ gồm chữ IN HOA, số và gạch dưới (VD: GARENA_100K)');

      return;

    }

    if (!name) {

      toast.error('Vui lòng nhập tên biến thể');

      return;

    }

    const faceValue = Number(newVariant.faceValue);

    const sellPrice = Number(newVariant.sellPrice);

    if (!Number.isFinite(faceValue) || faceValue < 0 || !Number.isFinite(sellPrice) || sellPrice < 0) {

      toast.error('Mệnh giá và giá bán phải là số hợp lệ');

      return;

    }

    try {

      const metadata =
        newVariant.type === 'DATA'
          ? {
              packageName: newVariant.packageName.trim() || undefined,
              capacity: newVariant.capacity.trim() || undefined,
              duration: newVariant.duration.trim() || undefined,
            }
          : undefined;

      await productAdminApi.createVariant(selectedProduct.id, {

        sku,

        name,

        type: newVariant.type,

        faceValue,

        sellPrice,

        ...(metadata ? { metadata } : {}),

      });

      setNewVariant(EMPTY_VARIANT);

      toast.success(vi.app.saved);

      await load();

    } catch (err) {

      toast.error(err instanceof ApiClientError ? err.message : vi.app.requestFailed);

    }

  }



  async function saveEditCategory() {

    if (!editCat) return;

    try {

      await productAdminApi.updateCategory(editCat.id, {
        name: editCat.name.trim(),
        iconUrl: editCat.iconUrl ?? null,
      });

      setEditCat(null);

      toast.success(vi.products.updateSuccess);

      await load();

    } catch (err) {

      toast.error(err instanceof ApiClientError ? err.message : vi.app.requestFailed);

    }

  }



  async function saveEditProduct() {

    if (!editProduct) return;

    try {

      await productAdminApi.updateProduct(editProduct.id, {

        name: editProduct.name.trim(),

        categoryId: editProduct.categoryId || undefined,

        logoUrl: editProduct.logoUrl ?? null,

        bannerUrl: editProduct.bannerUrl ?? null,

      });

      setEditProduct(null);

      toast.success(vi.products.updateSuccess);

      await load();

    } catch (err) {

      toast.error(err instanceof ApiClientError ? err.message : vi.app.requestFailed);

    }

  }



  async function saveEditVariant() {

    if (!editVariant) return;

    try {

      await productAdminApi.updateVariant(editVariant.id, {

        name: editVariant.name.trim(),

        type: editVariant.type,

        faceValue: Number(editVariant.faceValue),

        sellPrice: Number(editVariant.sellPrice),

        ...(editVariant.type === 'DATA'
          ? {
              metadata: {
                packageName: editVariant.packageName.trim() || undefined,
                capacity: editVariant.capacity.trim() || undefined,
                duration: editVariant.duration.trim() || undefined,
              },
            }
          : {}),

      });

      setEditVariant(null);

      toast.success(vi.products.updateSuccess);

      await load();

    } catch (err) {

      toast.error(err instanceof ApiClientError ? err.message : vi.app.requestFailed);

    }

  }



  async function createMapping() {

    if (!selectedVariantId || !newMapping.providerId) return;

    try {

      await productAdminApi.createProviderMapping(selectedVariantId, {

        providerId: newMapping.providerId,

        providerProductCode: newMapping.providerProductCode,

        providerCost: Number(newMapping.providerCost),

        priority: Number(newMapping.priority) || 1,

      });

      setNewMapping({ providerId: '', providerProductCode: '', providerCost: '', priority: '1' });

      setError(null);

      await loadMappings(selectedVariantId);

    } catch (err) {

      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);

    }

  }

  async function saveEditMapping() {

    if (!editMapping || !selectedVariantId) return;

    try {

      await productAdminApi.updateProviderMapping(editMapping.id, {

        providerProductCode: editMapping.providerProductCode.trim(),

        providerCost: Number(editMapping.providerCost),

        priority: Number(editMapping.priority) || 1,

      });

      setEditMapping(null);

      setError(null);

      await loadMappings(selectedVariantId);

    } catch (err) {

      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);

    }

  }



  const tabs: { id: Tab; label: string }[] = [

    { id: 'product', label: vi.products.tabProduct },

    { id: 'variant', label: vi.products.tabVariant },

    { id: 'mapping', label: vi.products.tabMapping },

  ];



  return (

    <RequirePermission permission="products.manage">

      <div className="space-y-6">

        <h1 className="text-2xl font-bold">{vi.products.title}</h1>

        <p className="text-sm text-zinc-600">

          Quy trình: Danh mục → Sản phẩm → Biến thể → Mapping nhà cung cấp. Ví dụ: Garena → Thẻ Garena →

          GARENA_100K (100.000đ).

        </p>

        {error && <ErrorMessage message={error} />}



        <div className="flex flex-wrap gap-2">

          {tabs.map((t) => (

            <Button key={t.id} variant={tab === t.id ? 'primary' : 'secondary'} size="sm" onClick={() => setTab(t.id)}>

              {t.label}

            </Button>

          ))}

        </div>



        {tab === 'product' && (

          <div className="grid gap-6 lg:grid-cols-2">

            <Card>

              <h2 className="font-semibold">{vi.products.categories}</h2>

              <ul className="mt-3 space-y-2 text-sm">

                {categories.map((c) => (

                  <li key={c.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2">

                    <span>

                      {c.name}{' '}
                      {c.homeService ? (
                        <Badge tone="info">{c.homeService}</Badge>
                      ) : null}{' '}
                      <Badge tone={statusTone(c.status)} status={c.status} />

                    </span>

                    <div className="flex gap-1">

                      <Button size="sm" variant="ghost" onClick={() => setEditCat({ id: c.id, name: c.name, iconUrl: c.iconUrl ?? null })}>

                        {vi.products.edit}

                      </Button>

                      {c.status === 'ACTIVE' ? (

                        <Button

                          size="sm"

                          variant="ghost"

                          onClick={() => void softDelete(() => productAdminApi.disableCategory(c.id))}

                        >

                          {vi.products.disableLabel}

                        </Button>

                      ) : (

                        <Button size="sm" variant="secondary" onClick={() => void productAdminApi.restoreCategory(c.id).then(load)}>

                          {vi.app.restore}

                        </Button>

                      )}

                      <Button

                        size="sm"

                        variant="danger"

                        onClick={() => void hardDelete(() => productAdminApi.deleteCategory(c.id))}

                      >

                        {vi.products.hardDelete}

                      </Button>

                    </div>

                  </li>

                ))}

              </ul>

              <div className="mt-4 space-y-2">

                <Label>{vi.products.name}</Label>

                <Input value={newCat.name} onChange={(e) => updateCatName(e.target.value)} />

                <Label>Dịch vụ trang chủ</Label>

                <Select
                  value={newCat.homeService}
                  onChange={(e) =>
                    setNewCat({ ...newCat, homeService: e.target.value as HomeServiceType })
                  }
                >
                  {HOME_SERVICE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>

                <Label>{vi.products.slug}</Label>

                <Input

                  value={newCat.slug}

                  onChange={(e) => setNewCat({ ...newCat, slug: e.target.value, slugManual: true })}

                />

                <Button size="sm" onClick={() => void createCategory()}>

                  {vi.products.addCategory}

                </Button>

              </div>

            </Card>



            <Card>

              <div className="flex flex-wrap items-center justify-between gap-2">

                <h2 className="font-semibold">{vi.products.products}</h2>

                <Select className="w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>

                  <option value="active">{vi.products.filterActive}</option>

                  <option value="inactive">{vi.products.filterInactive}</option>

                  <option value="all">{vi.products.filterAll}</option>

                </Select>

              </div>

              <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">

                {products.map((p) => (

                  <li key={p.id}>

                    <button

                      type="button"

                      className={`w-full rounded-lg px-3 py-2 text-left hover:bg-zinc-100 ${

                        selectedProduct?.id === p.id ? 'bg-admin-50 ring-1 ring-admin-200' : 'bg-zinc-50'

                      }`}

                      onClick={() => {

                        setSelectedProduct(p);

                        setSelectedVariantId('');

                        setMappings([]);

                      }}

                    >

                      {p.name} · {p.slug} <Badge tone={statusTone(p.status)} status={p.status} />

                    </button>

                  </li>

                ))}

              </ul>

              <div className="mt-4 space-y-2">

                <Label>{vi.products.selectCategory}</Label>

                <Select value={newProduct.categoryId} onChange={(e) => setNewProduct({ ...newProduct, categoryId: e.target.value })}>

                  <option value="">{vi.products.selectCategory}</option>

                  {categories.filter((c) => c.status === 'ACTIVE').map((c) => (

                    <option key={c.id} value={c.id}>

                      {categoryOptionLabel(c)}

                    </option>

                  ))}

                </Select>

                <Label>{vi.products.name}</Label>

                <Input value={newProduct.name} onChange={(e) => updateProductName(e.target.value)} />

                <Label>{vi.products.slug}</Label>

                <Input

                  value={newProduct.slug}

                  onChange={(e) => setNewProduct({ ...newProduct, slug: e.target.value, slugManual: true })}

                />

                <Button size="sm" onClick={() => void createProduct()}>

                  {vi.products.addProduct}

                </Button>

              </div>

              {selectedProduct && (

                <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4">

                  <Button

                    size="sm"

                    variant="secondary"

                    onClick={() =>

                      setEditProduct({

                        id: selectedProduct.id,

                        name: selectedProduct.name,

                        categoryId: selectedProduct.categoryId,

                        logoUrl: selectedProduct.logoUrl ?? null,

                        bannerUrl: selectedProduct.bannerUrl ?? null,

                      })

                    }

                  >

                    {vi.products.edit}

                  </Button>

                  {selectedProduct.status === 'ACTIVE' ? (

                    <Button

                      size="sm"

                      variant="ghost"

                      onClick={() => void softDelete(() => productAdminApi.disableProduct(selectedProduct.id))}

                    >

                      {vi.products.disableLabel}

                    </Button>

                  ) : (

                    <Button size="sm" variant="secondary" onClick={() => void productAdminApi.restoreProduct(selectedProduct.id).then(load)}>

                      {vi.app.restore}

                    </Button>

                  )}

                  <Button

                    size="sm"

                    variant="danger"

                    onClick={() => void hardDelete(() => productAdminApi.deleteProduct(selectedProduct.id))}

                  >

                    {vi.products.hardDelete}

                  </Button>

                  <Button size="sm" variant="secondary" onClick={() => setTab('variant')}>

                    {vi.products.tabVariant} →

                  </Button>

                </div>

              )}

            </Card>

          </div>

        )}



        {tab === 'variant' && (

          <Card>

            {!selectedProduct ? (

              <p className="text-zinc-500">{vi.products.selectProduct}</p>

            ) : (

              <>

                <h2 className="font-semibold">

                  {selectedProduct.name} <Badge tone={statusTone(selectedProduct.status)} status={selectedProduct.status} />

                </h2>

                <p className="mt-1 text-sm text-zinc-500">

                  Nhập SKU IN HOA (GARENA_10K, GARENA_20K…). Sau khi lưu, chọn Mapping để gán mã nhà cung cấp.

                </p>

                <div className="mt-4 space-y-2">

                  {(selectedProduct.variants ?? []).map((v) => (

                    <div

                      key={v.id}

                      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm ${

                        selectedVariantId === v.id ? 'border-admin-300 bg-admin-50' : 'border-zinc-100'

                      }`}

                    >

                      <span>

                        {v.sku} · {v.name} · {formatVnd(v.sellPrice)}{' '}

                        <Badge tone={statusTone(v.status)} status={v.status} />

                      </span>

                      <div className="flex flex-wrap gap-2">

                        <Button size="sm" variant="secondary" onClick={() => void loadMappings(v.id)}>

                          {vi.products.mappings}

                        </Button>

                        <Button

                          size="sm"

                          variant="ghost"

                          onClick={() => {
                            const meta = (v.metadata ?? {}) as Record<string, string>;
                            setEditVariant({
                              id: v.id,
                              name: v.name,
                              type: v.type,
                              faceValue: String(v.faceValue),
                              sellPrice: String(v.sellPrice),
                              packageName: meta.packageName ?? '',
                              capacity: meta.capacity ?? '',
                              duration: meta.duration ?? '',
                            });
                          }}

                        >

                          {vi.products.edit}

                        </Button>

                        {v.status === 'ACTIVE' ? (

                          <Button size="sm" variant="ghost" onClick={() => void softDelete(() => productAdminApi.disableVariant(v.id))}>

                            {vi.products.disableLabel}

                          </Button>

                        ) : (

                          <Button size="sm" variant="secondary" onClick={() => void productAdminApi.restoreVariant(v.id).then(load)}>

                            {vi.app.restore}

                          </Button>

                        )}

                        <Button size="sm" variant="danger" onClick={() => void hardDelete(() => productAdminApi.deleteVariant(v.id))}>

                          {vi.products.hardDelete}

                        </Button>

                      </div>

                    </div>

                  ))}

                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">

                  <div>

                    <Label>{vi.products.sku}</Label>

                    <Input className="mt-1" value={newVariant.sku} onChange={(e) => setNewVariant({ ...newVariant, sku: e.target.value.toUpperCase() })} placeholder="GARENA_100K" />

                  </div>

                  <div>

                    <Label>{vi.products.name}</Label>

                    <Input className="mt-1" value={newVariant.name} onChange={(e) => setNewVariant({ ...newVariant, name: e.target.value })} />

                  </div>

                  <div>

                    <Label>{vi.products.type}</Label>

                    <Select className="mt-1" value={newVariant.type} onChange={(e) => setNewVariant({ ...newVariant, type: e.target.value })}>

                      {allowedVariantTypes.includes('CARD') ? (
                        <option value="CARD">{vi.products.typeCard}</option>
                      ) : null}
                      {allowedVariantTypes.includes('TOPUP') ? (
                        <option value="TOPUP">{vi.products.typeTopup}</option>
                      ) : null}
                      {allowedVariantTypes.includes('DATA') ? (
                        <option value="DATA">{vi.products.typeData}</option>
                      ) : null}

                    </Select>

                    {selectedProductHomeService ? (
                      <p className="mt-1 text-xs text-gray-500">
                        Dịch vụ: {homeServiceLabel(selectedProductHomeService)}
                      </p>
                    ) : null}

                    <p className="mt-1 text-xs text-gray-500">
                      {newVariant.type === 'CARD'
                        ? vi.products.typeCardHelp
                        : newVariant.type === 'TOPUP'
                          ? vi.products.typeTopupHelp
                          : vi.products.typeDataHelp}
                    </p>

                  </div>

                  <div>

                    <Label>{vi.products.faceValue}</Label>

                    <Input className="mt-1" value={newVariant.faceValue} onChange={(e) => setNewVariant({ ...newVariant, faceValue: e.target.value })} />

                  </div>

                  <div>

                    <Label>{vi.products.sellPrice}</Label>

                    <Input className="mt-1" value={newVariant.sellPrice} onChange={(e) => setNewVariant({ ...newVariant, sellPrice: e.target.value })} />

                  </div>

                  {newVariant.type === 'DATA' && (
                    <>
                      <div>
                        <Label>{vi.products.dataPackageName}</Label>
                        <Input
                          className="mt-1"
                          value={newVariant.packageName}
                          onChange={(e) => setNewVariant({ ...newVariant, packageName: e.target.value })}
                          placeholder="ST15K"
                        />
                      </div>
                      <div>
                        <Label>{vi.products.dataCapacity}</Label>
                        <Input
                          className="mt-1"
                          value={newVariant.capacity}
                          onChange={(e) => setNewVariant({ ...newVariant, capacity: e.target.value })}
                          placeholder="3GB"
                        />
                      </div>
                      <div>
                        <Label>{vi.products.dataDuration}</Label>
                        <Input
                          className="mt-1"
                          value={newVariant.duration}
                          onChange={(e) => setNewVariant({ ...newVariant, duration: e.target.value })}
                          placeholder="3 ngày"
                        />
                      </div>
                    </>
                  )}

                </div>

                <Button

                  className="mt-4"

                  size="sm"

                  onClick={() => void createVariant()}

                >

                  {vi.products.addVariant}

                </Button>

                {selectedVariantId && (

                  <Button className="ml-2 mt-4" size="sm" variant="secondary" onClick={() => setTab('mapping')}>

                    {vi.products.tabMapping} →

                  </Button>

                )}

              </>

            )}

          </Card>

        )}



        {tab === 'mapping' && (

          <Card>

            {!selectedVariantId ? (

              <p className="text-zinc-500">{vi.products.selectVariant}</p>

            ) : (

              <>

                <h2 className="font-semibold">{vi.products.mappings}</h2>

                <ul className="mt-4 space-y-3 text-sm">

                  {mappings.map((m) => (

                    <li key={m.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">

                      {editMapping?.id === m.id ? (

                        <div className="grid gap-3 md:grid-cols-2">

                          <div>

                            <Label>{vi.products.providerCode}</Label>

                            <Input

                              className="mt-1"

                              value={editMapping.providerProductCode}

                              onChange={(e) =>

                                setEditMapping({ ...editMapping, providerProductCode: e.target.value })

                              }

                            />

                          </div>

                          <div>

                            <Label>{vi.products.providerCost}</Label>

                            <Input

                              className="mt-1"

                              value={editMapping.providerCost}

                              onChange={(e) => setEditMapping({ ...editMapping, providerCost: e.target.value })}

                            />

                          </div>

                          <div>

                            <Label>{vi.products.priority}</Label>

                            <Input

                              className="mt-1"

                              type="number"

                              min={0}

                              value={editMapping.priority}

                              onChange={(e) => setEditMapping({ ...editMapping, priority: e.target.value })}

                            />

                          </div>

                          <div className="flex items-end gap-2">

                            <Button size="sm" onClick={() => void saveEditMapping()}>

                              {vi.products.mappingSave}

                            </Button>

                            <Button size="sm" variant="secondary" onClick={() => setEditMapping(null)}>

                              {vi.app.cancel}

                            </Button>

                          </div>

                        </div>

                      ) : (

                        <div className="flex flex-wrap items-start justify-between gap-3">

                          <div className="space-y-1">

                            <p className="font-medium text-zinc-900">

                              {m.provider?.name ?? m.provider?.code ?? m.providerId}

                            </p>

                            <p className="text-zinc-600">

                              SKU: {m.providerProductCode} · {formatVnd(m.providerCost)} · Ưu tiên {m.priority}

                            </p>

                            <Badge

                              tone={statusTone(m.status)}

                              status={m.status === 'INACTIVE' ? vi.products.mappingInactive : m.status}

                            />

                            {m.availability && (
                              <Badge
                                tone={
                                  m.availability === 'AVAILABLE'
                                    ? 'success'
                                    : m.availability === 'MAINTENANCE'
                                      ? 'warning'
                                      : 'danger'
                                }
                                status={
                                  m.availability === 'AVAILABLE'
                                    ? 'Available ✓'
                                    : m.availability === 'MAINTENANCE'
                                      ? 'Bảo trì'
                                      : 'Hết hàng'
                                }
                              />
                            )}

                          </div>

                          <div className="flex flex-wrap gap-2">

                            <Button

                              size="sm"

                              variant="secondary"

                              onClick={() =>

                                setEditMapping({

                                  id: m.id,

                                  providerProductCode: m.providerProductCode,

                                  providerCost: String(m.providerCost),

                                  priority: String(m.priority),

                                })

                              }

                            >

                              {vi.products.mappingEdit}

                            </Button>

                            {m.status === 'ACTIVE' ? (

                              <Button

                                size="sm"

                                variant="ghost"

                                onClick={() =>

                                  void productAdminApi

                                    .disableProviderMapping(m.id)

                                    .then(() => loadMappings(selectedVariantId))

                                    .catch((err) =>

                                      setError(

                                        err instanceof ApiClientError ? err.message : vi.app.requestFailed,

                                      ),

                                    )

                                }

                              >

                                {vi.products.mappingDisable}

                              </Button>

                            ) : (

                              <Button

                                size="sm"

                                variant="ghost"

                                onClick={() =>

                                  void productAdminApi

                                    .enableProviderMapping(m.id)

                                    .then(() => loadMappings(selectedVariantId))

                                    .catch((err) =>

                                      setError(

                                        err instanceof ApiClientError ? err.message : vi.app.requestFailed,

                                      ),

                                    )

                                }

                              >

                                {vi.products.mappingEnable}

                              </Button>

                            )}

                          </div>

                        </div>

                      )}

                    </li>

                  ))}

                </ul>

                <div className="mt-6 grid gap-3 md:grid-cols-2">

                  <div>

                    <Label>{vi.products.provider}</Label>

                    <Select className="mt-1" value={newMapping.providerId} onChange={(e) => setNewMapping({ ...newMapping, providerId: e.target.value })}>

                      <option value="">Chọn nhà cung cấp</option>

                      {providers.map((p) => (

                        <option key={p.id} value={p.id}>

                          {p.name} ({p.code})

                        </option>

                      ))}

                    </Select>

                  </div>

                  <div>

                    <Label>{vi.products.providerCode}</Label>

                    <Input

                      className="mt-1"

                      placeholder={mappingCodePlaceholder}

                      value={newMapping.providerProductCode}

                      onChange={(e) => setNewMapping({ ...newMapping, providerProductCode: e.target.value })}

                    />

                    <p className="mt-1 text-xs text-gray-500">{mappingCodeHelp}</p>

                  </div>

                  <div>

                    <Label>{vi.products.providerCost}</Label>

                    <Input className="mt-1" value={newMapping.providerCost} onChange={(e) => setNewMapping({ ...newMapping, providerCost: e.target.value })} />

                  </div>

                  <div>

                    <Label>{vi.products.priority}</Label>

                    <Input className="mt-1" type="number" min={1} value={newMapping.priority} onChange={(e) => setNewMapping({ ...newMapping, priority: e.target.value })} />

                  </div>

                </div>

                <Button className="mt-4" size="sm" onClick={() => void createMapping()}>

                  {vi.products.addMapping}

                </Button>

              </>

            )}

          </Card>

        )}



        {editCat && (

          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

            <Card className="w-full max-w-md space-y-4">

              <h2 className="font-semibold">{vi.products.editCategory}</h2>

              <div>

                <Label>{vi.products.name}</Label>

                <Input className="mt-1" value={editCat.name} onChange={(e) => setEditCat({ ...editCat, name: e.target.value })} />

              </div>

              <MediaImageField

                label="Icon danh mục"

                folder="products"

                value={editCat.iconUrl ?? ''}

                onChange={(url) => setEditCat({ ...editCat, iconUrl: url || null })}

              />

              <div className="flex gap-2">

                <Button size="sm" onClick={() => void saveEditCategory()}>

                  {vi.app.save}

                </Button>

                <Button size="sm" variant="ghost" onClick={() => setEditCat(null)}>

                  {vi.app.cancel}

                </Button>

              </div>

            </Card>

          </div>

        )}



        {editProduct && (

          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

            <Card className="w-full max-w-md space-y-4">

              <h2 className="font-semibold">{vi.products.editProduct}</h2>

              <div>

                <Label>{vi.products.name}</Label>

                <Input className="mt-1" value={editProduct.name} onChange={(e) => setEditProduct({ ...editProduct, name: e.target.value })} />

              </div>

              <div>

                <Label>{vi.products.selectCategory}</Label>

                <Select

                  className="mt-1"

                  value={editProduct.categoryId}

                  onChange={(e) => setEditProduct({ ...editProduct, categoryId: e.target.value })}

                >

                  {categories.filter((c) => c.status === 'ACTIVE').map((c) => (

                    <option key={c.id} value={c.id}>

                      {categoryOptionLabel(c)}

                    </option>

                  ))}

                </Select>

              </div>

              <MediaImageField

                label="Logo sản phẩm"

                folder="products"

                value={editProduct.logoUrl ?? ''}

                onChange={(url) => setEditProduct({ ...editProduct, logoUrl: url || null })}

              />

              <MediaImageField

                label="Banner sản phẩm (tuỳ chọn)"

                folder="banners"

                value={editProduct.bannerUrl ?? ''}

                onChange={(url) => setEditProduct({ ...editProduct, bannerUrl: url || null })}

              />

              <div className="flex gap-2">

                <Button size="sm" onClick={() => void saveEditProduct()}>

                  {vi.app.save}

                </Button>

                <Button size="sm" variant="ghost" onClick={() => setEditProduct(null)}>

                  {vi.app.cancel}

                </Button>

              </div>

            </Card>

          </div>

        )}



        {editVariant && (

          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

            <Card className="w-full max-w-lg space-y-4">

              <h2 className="font-semibold">{vi.products.editVariant}</h2>

              <div className="grid gap-3 sm:grid-cols-2">

                <div>

                  <Label>{vi.products.name}</Label>

                  <Input className="mt-1" value={editVariant.name} onChange={(e) => setEditVariant({ ...editVariant, name: e.target.value })} />

                </div>

                <div>

                  <Label>{vi.products.type}</Label>

                  <Select className="mt-1" value={editVariant.type} onChange={(e) => setEditVariant({ ...editVariant, type: e.target.value })}>

                    <option value="CARD">{vi.products.typeCard}</option>

                    <option value="TOPUP">{vi.products.typeTopup}</option>

                    <option value="DATA">{vi.products.typeData}</option>

                  </Select>

                  <p className="mt-1 text-xs text-gray-500">
                    {editVariant.type === 'CARD'
                      ? vi.products.typeCardHelp
                      : editVariant.type === 'TOPUP'
                        ? vi.products.typeTopupHelp
                        : vi.products.typeDataHelp}
                  </p>

                </div>

                <div>

                  <Label>{vi.products.faceValue}</Label>

                  <Input className="mt-1" value={editVariant.faceValue} onChange={(e) => setEditVariant({ ...editVariant, faceValue: e.target.value })} />

                </div>

                <div>

                  <Label>{vi.products.sellPrice}</Label>

                  <Input className="mt-1" value={editVariant.sellPrice} onChange={(e) => setEditVariant({ ...editVariant, sellPrice: e.target.value })} />

                </div>

                {editVariant.type === 'DATA' && (
                  <>
                    <div>
                      <Label>{vi.products.dataPackageName}</Label>
                      <Input
                        className="mt-1"
                        value={editVariant.packageName}
                        onChange={(e) => setEditVariant({ ...editVariant, packageName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>{vi.products.dataCapacity}</Label>
                      <Input
                        className="mt-1"
                        value={editVariant.capacity}
                        onChange={(e) => setEditVariant({ ...editVariant, capacity: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>{vi.products.dataDuration}</Label>
                      <Input
                        className="mt-1"
                        value={editVariant.duration}
                        onChange={(e) => setEditVariant({ ...editVariant, duration: e.target.value })}
                      />
                    </div>
                  </>
                )}

              </div>

              <div className="flex gap-2">

                <Button size="sm" onClick={() => void saveEditVariant()}>

                  {vi.app.save}

                </Button>

                <Button size="sm" variant="ghost" onClick={() => setEditVariant(null)}>

                  {vi.app.cancel}

                </Button>

              </div>

            </Card>

          </div>

        )}

      </div>

    </RequirePermission>

  );

}

