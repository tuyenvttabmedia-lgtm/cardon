'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AdminTestOrderDialog, type AdminTestPaypalSnapshot } from '@/components/esim/AdminTestOrderDialog';
import { EsimFlag } from '@/components/esim/EsimFlag';
import { RequirePermission } from '@/components/layout/AdminShell';
import { useAuth } from '@/hooks/useAuth';
import { canUseAdminTest } from '@/lib/esim-admin-test-checkout';
import { isEsimTestOrderVariant, publishedEsimVariantIds } from '@/lib/esim-admin-ops';
import { MediaImageField } from '@/components/marketing/MediaImageField';
import { Badge, Card, ErrorMessage, statusTone } from '@/components/ui/Display';
import { Dialog, Drawer } from '@/components/ui/Dialog';
import { Button, Input, Label, Select, Textarea } from '@/components/ui/Form';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableEmpty, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { useToast } from '@/components/ui/Toast';
import { vi } from '@/lib/i18n/vi';
import { slugify } from '@/lib/slugify';
import { formatVnd } from '@/lib/utils';
import { adminApi, ApiClientError, productAdminApi, settingsAdminApi } from '@/services/api-client';
import {
  filterEsimCatalogCategories,
  filterEsimCatalogProducts,
  type Category,
  type OrderView,
  type Product,
  type ProductVariant,
  type ProviderMapping,
  type ProviderStatus,
} from '@/types/api';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU_PATTERN = /^[A-Z0-9_]+$/;
const MONEY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const CATALOG_PRICE_LABEL = 'Giá catalog đã quy đổi, làm tròn nghìn đồng. Đây chưa phải giá bán khách hàng.';
const PAGE_SIZES = [10, 20, 50];
const ESIM_PROVIDER_CODES = new Set(['AIRALO']);

type StatusFilter = 'active' | 'inactive' | 'all';
type MappingFilter = 'all' | 'full' | 'partial' | 'none';
type CatalogTab = 'products' | 'mappings';
type DrawerTab = 'info' | 'variants' | 'mapping';

function slugError(slug: string): string | null {
  if (slug === 'esim-test') return 'Slug esim-test không được dùng.';
  if (!SLUG_PATTERN.test(slug)) return 'Slug chỉ gồm chữ thường, số và dấu gạch ngang.';
  return null;
}

function parseCatalogMoney(value: string): number | null {
  const trimmed = value.trim();
  if (!MONEY_PATTERN.test(trimmed)) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount;
}

function apiError(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.message : fallback;
}

function esimVariants(product: Product): ProductVariant[] {
  return (product.variants ?? []).filter((variant) => variant.type === 'ESIM');
}

function isMapped(variant: ProductVariant): boolean | null {
  if (!variant.providerMappings) return null;
  return variant.providerMappings.some((mapping) => mapping.status === 'ACTIVE');
}

function mappingCounts(product: Product): { mapped: number; total: number; unknown: boolean } {
  const variants = esimVariants(product);
  let mapped = 0;
  let unknown = false;
  for (const variant of variants) {
    const state = isMapped(variant);
    if (state === null) unknown = true;
    else if (state) mapped += 1;
  }
  return { mapped, total: variants.length, unknown };
}

function mappingKind(product: Product): MappingFilter | 'unknown' {
  const counts = mappingCounts(product);
  if (counts.unknown || counts.total === 0) return 'unknown';
  if (counts.mapped === counts.total) return 'full';
  if (counts.mapped === 0) return 'none';
  return 'partial';
}

function priceSpan(product: Product): string {
  const prices = esimVariants(product)
    .map((variant) => Number(variant.sellPrice))
    .filter((value) => Number.isFinite(value));
  if (prices.length === 0) return '—';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatVnd(min) : `${formatVnd(min)} – ${formatVnd(max)}`;
}

function planLabel(sku: string, name: string): string {
  const fixed = sku.match(/(\d+)GB_(\d+)D/i);
  if (fixed) return `${fixed[1]} GB / ${fixed[2]} ngày`;
  const unlimited = sku.match(/UL(?:E|P)?_(\d+)D/i);
  if (unlimited) return `Không giới hạn / ${unlimited[1]} ngày`;
  return name;
}

function formatWhen(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function MappingLabel({ product }: { product: Product }) {
  const counts = mappingCounts(product);
  const kind = mappingKind(product);
  if (kind === 'unknown') return <span className="text-xs text-slate-400">Chưa có dữ liệu mapping</span>;
  if (kind === 'full') return <span className="text-xs font-medium text-emerald-700">Đã mapping {counts.mapped}/{counts.total}</span>;
  if (kind === 'none') return <span className="text-xs font-medium text-slate-600">Chưa mapping</span>;
  return <span className="text-xs font-medium text-amber-700">Thiếu mapping {counts.total - counts.mapped}</span>;
}

export default function EsimCatalogAdminPage() {
  const toast = useToast();
  const { user, can } = useAuth();
  const canCreateTestOrder = canUseAdminTest(user?.role, can);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [mappingFilter, setMappingFilter] = useState<MappingFilter>('all');
  const [sort, setSort] = useState<'newest' | 'name'>('newest');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [tab, setTab] = useState<CatalogTab>('products');
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('info');
  const [editing, setEditing] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [mappings, setMappings] = useState<ProviderMapping[]>([]);
  const [mappingVariantId, setMappingVariantId] = useState('');
  const [variantQuery, setVariantQuery] = useState('');
  const [variantStatus, setVariantStatus] = useState<'all' | 'ACTIVE' | 'INACTIVE'>('all');
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [showCreateVariant, setShowCreateVariant] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; action: () => Promise<unknown> } | null>(null);
  const [publishedVariantIds, setPublishedVariantIds] = useState<Set<string>>(new Set());
  const [testOrder, setTestOrder] = useState<OrderView | null>(null);
  const [paypalSnapshot, setPaypalSnapshot] = useState<AdminTestPaypalSnapshot | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [pendingTestVariant, setPendingTestVariant] = useState<ProductVariant | null>(null);

  const [newProduct, setNewProduct] = useState({
    name: '',
    slug: '',
    slugManual: false,
    description: '',
    logoUrl: '',
    bannerUrl: '',
  });
  const [editProduct, setEditProduct] = useState({
    name: '',
    description: '',
    logoUrl: '',
    bannerUrl: '',
  });
  const [newVariant, setNewVariant] = useState({ sku: '', name: '', faceValue: '', sellPrice: '' });
  const [editVariant, setEditVariant] = useState<{
    id: string;
    name: string;
    faceValue: string;
    sellPrice: string;
  } | null>(null);
  const [newMapping, setNewMapping] = useState({
    providerId: '',
    providerProductCode: '',
    providerCost: '',
    priority: '0',
  });
  const [editMapping, setEditMapping] = useState<{
    id: string;
    providerProductCode: string;
    providerCost: string;
    priority: string;
    status: string;
  } | null>(null);
  const [productError, setProductError] = useState('');

  const esimProviders = useMemo(
    () => providers.filter((provider) => ESIM_PROVIDER_CODES.has(provider.code)),
    [providers],
  );
  const catalogCategory = useMemo(() => {
    const active = filterEsimCatalogCategories(categories, true);
    return active.find((category) => category.slug === 'esim-du-lich') ?? active[0] ?? null;
  }, [categories]);
  const allEsimProducts = useMemo(() => filterEsimCatalogProducts(products), [products]);
  const filteredProducts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const rows = allEsimProducts.filter((product) => {
      if (statusFilter === 'active' && product.status !== 'ACTIVE') return false;
      if (statusFilter === 'inactive' && product.status === 'ACTIVE') return false;
      const kind = mappingKind(product);
      if (mappingFilter !== 'all' && kind !== mappingFilter) return false;
      if (!keyword) return true;
      const skuMatch = esimVariants(product).some((variant) => variant.sku.toLowerCase().includes(keyword) || variant.name.toLowerCase().includes(keyword));
      return (
        product.name.toLowerCase().includes(keyword) ||
        product.slug.toLowerCase().includes(keyword) ||
        skuMatch
      );
    });
    return [...rows].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'vi');
      return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
    });
  }, [allEsimProducts, mappingFilter, query, sort, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selected = allEsimProducts.find((product) => product.id === selectedId) ?? null;
  const selectedVariants = selected ? esimVariants(selected) : [];
  const visibleVariants = selectedVariants.filter((variant) => {
    if (variantStatus !== 'all' && variant.status !== variantStatus) return false;
    const keyword = variantQuery.trim().toLowerCase();
    if (!keyword) return true;
    return variant.sku.toLowerCase().includes(keyword) || variant.name.toLowerCase().includes(keyword);
  });

  const stats = useMemo(() => {
    const variantTotal = allEsimProducts.reduce((sum, product) => sum + esimVariants(product).length, 0);
    const unmapped = allEsimProducts.filter((product) => {
      const kind = mappingKind(product);
      return kind === 'none' || kind === 'partial';
    }).length;
    return {
      countries: allEsimProducts.length,
      variants: variantTotal,
      unmapped,
    };
  }, [allEsimProducts]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [cats, prods, provs, catalogue] = await Promise.all([
        productAdminApi.listCategories(),
        productAdminApi.listProductsFiltered('all'),
        adminApi.getProvidersStatus(),
        canCreateTestOrder ? settingsAdminApi.getAiraloCatalogue() : Promise.resolve(null),
      ]);
      setCategories(cats);
      setProducts(prods);
      setProviders(provs);
      setPublishedVariantIds(publishedEsimVariantIds(catalogue?.packages ?? []));
    } catch (err) {
      setError(apiError(err, vi.app.requestFailed));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!canCreateTestOrder) return;
    void settingsAdminApi
      .getAiraloCatalogue()
      .then((catalogue) => setPublishedVariantIds(publishedEsimVariantIds(catalogue.packages)))
      .catch(() => setPublishedVariantIds(new Set()));
  }, [canCreateTestOrder]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, mappingFilter, sort, pageSize]);

  useEffect(() => {
    if (!selectedId || loading) return;
    if (!allEsimProducts.some((product) => product.id === selectedId)) {
      setSelectedId('');
      setDrawerOpen(false);
      setEditVariant(null);
      setEditMapping(null);
      setMappings([]);
      setMappingVariantId('');
    }
  }, [allEsimProducts, selectedId, loading]);

  useEffect(() => {
    if (!selected) return;
    setEditing(false);
    setEditProduct({
      name: selected.name,
      description: selected.description ?? '',
      logoUrl: selected.logoUrl ?? '',
      bannerUrl: selected.bannerUrl ?? '',
    });
  }, [selected?.id]);

  function openProduct(productId: string, nextTab: DrawerTab = 'info') {
    setSelectedId(productId);
    setDrawerTab(nextTab);
    setDrawerOpen(true);
    setEditVariant(null);
    setEditMapping(null);
    setShowCreateVariant(false);
    if (nextTab !== 'mapping') {
      setMappings([]);
      setMappingVariantId('');
    }
  }

  async function loadMappings(variantId: string) {
    const variant = selectedVariants.find((item) => item.id === variantId) ?? allEsimProducts.flatMap(esimVariants).find((item) => item.id === variantId);
    if (!variant || variant.type !== 'ESIM') return;
    setMappingVariantId(variantId);
    try {
      setMappings(await productAdminApi.listProviderMappings(variantId));
    } catch (err) {
      toast.error(apiError(err, vi.app.requestFailed));
    }
  }

  function askConfirm(title: string, action: () => Promise<unknown>) {
    setConfirm({ title, action });
  }

  async function runConfirm() {
    if (!confirm) return;
    const action = confirm.action;
    setConfirm(null);
    try {
      await action();
      toast.success(vi.app.saved);
      await load();
    } catch (err) {
      toast.error(apiError(err, vi.app.requestFailed));
    }
  }

  async function createProduct() {
    const slug = newProduct.slug.trim();
    const invalid = slugError(slug);
    if (!newProduct.name.trim()) {
      setProductError('Nhập tên sản phẩm.');
      return;
    }
    if (newProduct.name.trim().length < 2) {
      setProductError('Tên sản phẩm cần ít nhất 2 ký tự.');
      return;
    }
    if (invalid) {
      setProductError(invalid);
      return;
    }
    if (!catalogCategory) {
      setProductError('Chưa có danh mục catalog eSIM du lịch. Không tạo danh mục quốc gia riêng.');
      return;
    }
    setProductError('');
    try {
      await productAdminApi.createProduct({
        categoryId: catalogCategory.id,
        slug,
        name: newProduct.name.trim(),
        description: newProduct.description.trim() || undefined,
        logoUrl: newProduct.logoUrl || undefined,
        bannerUrl: newProduct.bannerUrl || undefined,
      });
      setNewProduct({
        name: '',
        slug: '',
        slugManual: false,
        description: '',
        logoUrl: '',
        bannerUrl: '',
      });
      setShowCreateProduct(false);
      toast.success(vi.app.saved);
      await load();
    } catch (err) {
      const message = apiError(err, vi.app.requestFailed);
      setProductError(message);
      toast.error(message);
    }
  }

  async function saveProduct() {
    if (!selected) return;
    if (editProduct.name.trim().length < 2) {
      toast.error('Tên sản phẩm cần ít nhất 2 ký tự.');
      return;
    }
    try {
      await productAdminApi.updateProduct(selected.id, {
        name: editProduct.name.trim(),
        description: editProduct.description.trim(),
        logoUrl: editProduct.logoUrl || null,
        bannerUrl: editProduct.bannerUrl || null,
      });
      setEditing(false);
      toast.success(vi.app.saved);
      await load();
    } catch (err) {
      toast.error(apiError(err, vi.app.requestFailed));
    }
  }

  async function createVariant() {
    if (!selected) return;
    const sku = newVariant.sku.trim().toUpperCase();
    if (!SKU_PATTERN.test(sku)) {
      toast.error('SKU chỉ gồm chữ in hoa, số và gạch dưới.');
      return;
    }
    if (newVariant.name.trim().length < 2) {
      toast.error('Tên variant cần ít nhất 2 ký tự.');
      return;
    }
    const faceValue = parseCatalogMoney(newVariant.faceValue);
    const sellPrice = parseCatalogMoney(newVariant.sellPrice);
    if (faceValue === null || sellPrice === null) {
      toast.error('Mệnh giá và giá catalog phải là số không âm, tối đa hai chữ số thập phân.');
      return;
    }
    try {
      await productAdminApi.createVariant(selected.id, {
        sku,
        name: newVariant.name.trim(),
        type: 'ESIM',
        faceValue,
        sellPrice,
      });
      setNewVariant({ sku: '', name: '', faceValue: '', sellPrice: '' });
      setShowCreateVariant(false);
      toast.success(vi.app.saved);
      await load();
    } catch (err) {
      toast.error(apiError(err, vi.app.requestFailed));
    }
  }

  async function saveVariant() {
    if (!editVariant) return;
    if (editVariant.name.trim().length < 2) {
      toast.error('Tên variant cần ít nhất 2 ký tự.');
      return;
    }
    const faceValue = parseCatalogMoney(editVariant.faceValue);
    const sellPrice = parseCatalogMoney(editVariant.sellPrice);
    if (faceValue === null || sellPrice === null) {
      toast.error('Mệnh giá và giá catalog phải là số không âm, tối đa hai chữ số thập phân.');
      return;
    }
    try {
      await productAdminApi.updateVariant(editVariant.id, {
        name: editVariant.name.trim(),
        type: 'ESIM',
        faceValue,
        sellPrice,
      });
      setEditVariant(null);
      toast.success(vi.app.saved);
      await load();
    } catch (err) {
      toast.error(apiError(err, vi.app.requestFailed));
    }
  }

  async function createMapping() {
    if (!mappingVariantId) {
      toast.error('Chọn variant eSIM trước khi tạo mapping.');
      return;
    }
    const providerCost = parseCatalogMoney(newMapping.providerCost);
    if (!newMapping.providerId || !newMapping.providerProductCode.trim() || providerCost === null) {
      toast.error('Cần nhà cung cấp, mã gói và giá vốn catalog hợp lệ.');
      return;
    }
    if (!/^\d+$/.test(newMapping.priority.trim())) {
      toast.error('Độ ưu tiên phải là số nguyên không âm.');
      return;
    }
    try {
      await productAdminApi.createProviderMapping(mappingVariantId, {
        providerId: newMapping.providerId,
        providerProductCode: newMapping.providerProductCode.trim(),
        providerCost,
        priority: Number(newMapping.priority),
      });
      setNewMapping({ providerId: '', providerProductCode: '', providerCost: '', priority: '0' });
      toast.success(vi.app.saved);
      await loadMappings(mappingVariantId);
      await load();
    } catch (err) {
      toast.error(apiError(err, vi.app.requestFailed));
    }
  }

  async function saveMapping() {
    if (!editMapping) return;
    const providerCost = parseCatalogMoney(editMapping.providerCost);
    if (!editMapping.providerProductCode.trim() || providerCost === null) {
      toast.error('Cần mã gói và giá vốn catalog hợp lệ.');
      return;
    }
    if (!/^\d+$/.test(editMapping.priority.trim())) {
      toast.error('Độ ưu tiên phải là số nguyên không âm.');
      return;
    }
    if (editMapping.status !== 'ACTIVE' && editMapping.status !== 'INACTIVE') {
      toast.error('Trạng thái mapping chỉ là ACTIVE hoặc INACTIVE.');
      return;
    }
    try {
      await productAdminApi.updateProviderMapping(editMapping.id, {
        providerProductCode: editMapping.providerProductCode.trim(),
        providerCost,
        priority: Number(editMapping.priority),
        status: editMapping.status,
      });
      setEditMapping(null);
      toast.success(vi.app.saved);
      if (mappingVariantId) await loadMappings(mappingVariantId);
      await load();
    } catch (err) {
      toast.error(apiError(err, vi.app.requestFailed));
    }
  }

  const rangeStart = filteredProducts.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, filteredProducts.length);
  const pageIds = pageRows.map((product) => product.id);
  const allPageChecked = pageIds.length > 0 && pageIds.every((id) => checked.includes(id));

  return (
    <RequirePermission permission="products.manage">
      <div className="space-y-4">
        <PageHeader
          breadcrumbs={[{ label: 'Sản phẩm', href: '/products' }, { label: 'Catalog eSIM' }]}
          title="Quản lý Catalog eSIM"
          subtitle="Mỗi quốc gia là một sản phẩm trong danh mục eSIM du lịch. Biến thể là gói cước. Mapping gắn gói với nhà cung cấp."
        />
        <p className="text-xs text-slate-500">{CATALOG_PRICE_LABEL}</p>

        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Quốc gia" value={loading ? '…' : String(stats.countries)} note="Mỗi sản phẩm eSIM là một quốc gia" />
          <StatCard label="Biến thể" value={loading ? '…' : String(stats.variants)} note="Gói cước thuộc các quốc gia" />
          <StatCard label="Chưa mapping" value={loading ? '…' : String(stats.unmapped)} note="Quốc gia còn gói chưa gắn nhà cung cấp" />
        </div>

        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === 'products'} onClick={() => setTab('products')}>Sản phẩm eSIM</TabButton>
          <TabButton active={tab === 'mappings'} onClick={() => setTab('mappings')}>Mapping nhà cung cấp</TabButton>
        </div>

        {error ? <ErrorMessage message={error} /> : null}
        {canCreateTestOrder ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            «Tạo đơn kiểm thử» chỉ dành cho SUPER_ADMIN, tạo đơn thử gắn tài khoản admin.
            Không mở bán công khai và không phải eSIM thương mại cho khách.
          </p>
        ) : null}
        {paypalSnapshot ? (
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800">
            <p className="font-medium">Đơn kiểm thử PayPal Sandbox {paypalSnapshot.orderCode}</p>
            <p>Order ID: <span className="font-mono">{paypalSnapshot.orderId}</span></p>
            <p>Gói: {paypalSnapshot.packageName}</p>
            <p>Giá catalog: {paypalSnapshot.catalogVnd}</p>
            <p>Số tiền thanh toán thử nghiệm: {paypalSnapshot.testAmountUsd} USD. Không tính vào doanh thu bán hàng.</p>
            <p>Gateway: PayPal Sandbox</p>
            <p>Trạng thái payment: {paypalSnapshot.paymentStatus}</p>
            {paypalSnapshot.approvalUrl ? (
              <a className="font-medium underline" href={paypalSnapshot.approvalUrl} target="_blank" rel="noopener noreferrer">
                Mở PayPal Sandbox Checkout
              </a>
            ) : null}
          </div>
        ) : null}
        {testOrder ? (
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
            Đã tạo {testOrder.orderCode} · {testOrder.paymentStatus} / {testOrder.fulfillmentStatus}.{' '}
            <Link href={`/esim-ops/${testOrder.id}`} className="font-medium underline">
              Mở chi tiết vận hành
            </Link>
          </p>
        ) : null}

        {tab === 'products' ? (
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="min-w-[220px] flex-1"
                value={query}
                placeholder="Tìm tên quốc gia, slug hoặc SKU"
                onChange={(event) => setQuery(event.target.value)}
              />
              <Select className="w-auto min-w-[140px]" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                <option value="all">Trạng thái: tất cả</option>
                <option value="active">Đang hoạt động</option>
                <option value="inactive">Ngừng hoạt động</option>
              </Select>
              <Select className="w-auto min-w-[150px]" value={mappingFilter} onChange={(event) => setMappingFilter(event.target.value as MappingFilter)}>
                <option value="all">Mapping: tất cả</option>
                <option value="full">Đã mapping</option>
                <option value="partial">Thiếu mapping</option>
                <option value="none">Chưa mapping</option>
              </Select>
              <Select className="w-auto min-w-[160px]" value={sort} onChange={(event) => setSort(event.target.value as 'newest' | 'name')}>
                <option value="newest">Tạo gần nhất</option>
                <option value="name">Tên A–Z</option>
              </Select>
              <Button size="sm" onClick={() => { setProductError(''); setShowCreateProduct(true); }}>Thêm quốc gia</Button>
            </div>
            {checked.length > 0 ? (
              <p className="mt-3 text-xs text-slate-500">Đã chọn {checked.length} dòng. Catalog chưa có thao tác hàng loạt.</p>
            ) : null}
            <div className="mt-3">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-10">
                      <input
                        type="checkbox"
                        aria-label="Chọn trang này"
                        checked={allPageChecked}
                        onChange={(event) => {
                          setChecked((prev) => event.target.checked ? [...new Set([...prev, ...pageIds])] : prev.filter((id) => !pageIds.includes(id)));
                        }}
                      />
                    </TH>
                    <TH>Sản phẩm / quốc gia</TH>
                    <TH>Biến thể</TH>
                    <TH>Giá catalog</TH>
                    <TH>Mapping</TH>
                    <TH>Trạng thái</TH>
                    <TH>Tạo lúc</TH>
                    <TH>Thao tác</TH>
                  </TR>
                </THead>
                <TBody>
                  {loading ? <TableSkeleton colSpan={8} /> : null}
                  {!loading && pageRows.length === 0 ? (
                    <TableEmpty colSpan={8} message={allEsimProducts.length === 0 ? 'Chưa có sản phẩm eSIM trong catalog.' : 'Không có kết quả phù hợp bộ lọc.'} />
                  ) : null}
                  {pageRows.map((product) => (
                    <TR key={product.id}>
                      <TD>
                        <input
                          type="checkbox"
                          aria-label={`Chọn ${product.name}`}
                          checked={checked.includes(product.id)}
                          onChange={(event) => {
                            setChecked((prev) => event.target.checked ? [...prev, product.id] : prev.filter((id) => id !== product.id));
                          }}
                        />
                      </TD>
                      <TD>
                        <span className="flex items-center gap-2">
                          <EsimFlag name={product.name} slug={product.slug} />
                          <span>
                            <span className="block font-medium text-slate-900">{product.name}</span>
                            <span className="block text-xs text-slate-500">{product.slug}</span>
                          </span>
                        </span>
                      </TD>
                      <TD>{esimVariants(product).length}</TD>
                      <TD>{priceSpan(product)}</TD>
                      <TD><MappingLabel product={product} /></TD>
                      <TD><Badge tone={statusTone(product.status)} status={product.status} /></TD>
                      <TD>{formatWhen(product.createdAt)}</TD>
                      <TD>
                        <Button size="sm" variant="secondary" onClick={() => openProduct(product.id)}>Mở chi tiết</Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            <Pager
              start={rangeStart}
              end={rangeEnd}
              total={filteredProducts.length}
              page={currentPage}
              pageCount={pageCount}
              pageSize={pageSize}
              onPage={setPage}
              onPageSize={(size) => setPageSize(size)}
            />
          </Card>
        ) : null}

        {tab === 'mappings' ? (
          <Card className="p-4">
            <p className="mb-3 text-sm text-slate-500">Mapping vẫn tạo và sửa theo từng biến thể. Bảng này chỉ gom dữ liệu mapping đang có trên catalog.</p>
            <Table>
              <THead>
                <TR>
                  <TH>Sản phẩm</TH>
                  <TH>SKU</TH>
                  <TH>Gói</TH>
                  <TH>Nhà cung cấp</TH>
                  <TH>Mapping</TH>
                  <TH>Thao tác</TH>
                </TR>
              </THead>
              <TBody>
                {loading ? <TableSkeleton colSpan={6} /> : null}
                {!loading && allEsimProducts.flatMap(esimVariants).length === 0 ? <TableEmpty colSpan={6} message="Chưa có biến thể eSIM." /> : null}
                {allEsimProducts.flatMap((product) => esimVariants(product).map((variant) => (
                  <TR key={variant.id}>
                    <TD>
                      <span className="flex items-center gap-2">
                        <EsimFlag name={product.name} slug={product.slug} />
                        {product.name}
                      </span>
                    </TD>
                    <TD>{variant.sku}</TD>
                    <TD>{planLabel(variant.sku, variant.name)}</TD>
                    <TD>{variant.providerMappings?.map((mapping) => mapping.provider?.name ?? mapping.providerProductCode).join(', ') || '—'}</TD>
                    <TD>{isMapped(variant) === null ? '—' : isMapped(variant) ? 'Đã mapping' : 'Chưa mapping'}</TD>
                    <TD>
                      <Button size="sm" variant="secondary" onClick={() => { openProduct(product.id, 'mapping'); void loadMappings(variant.id); }}>
                        Mở mapping
                      </Button>
                    </TD>
                  </TR>
                )))}
              </TBody>
            </Table>
          </Card>
        ) : null}
      </div>

      <Drawer
        open={drawerOpen && Boolean(selected)}
        onClose={() => setDrawerOpen(false)}
        title={
          selected ? (
            <span className="flex items-center gap-2">
              <EsimFlag name={selected.name} slug={selected.slug} />
              {selected.name}
            </span>
          ) : 'Sản phẩm eSIM'
        }
        side="right"
        withHeader
        panelClassName="w-full max-w-3xl border-l border-slate-200 bg-white"
      >
        {selected ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-slate-100 px-5 py-3">
              <p className="text-xs text-slate-500">{selected.slug}</p>
              <div className="mt-1"><Badge tone={statusTone(selected.status)} status={selected.status} /></div>
            </div>
            <div className="flex gap-2 border-b border-slate-100 px-5 py-2">
              <TabButton active={drawerTab === 'info'} onClick={() => setDrawerTab('info')}>Thông tin chung</TabButton>
              <TabButton active={drawerTab === 'variants'} onClick={() => setDrawerTab('variants')}>Biến thể</TabButton>
              <TabButton active={drawerTab === 'mapping'} onClick={() => setDrawerTab('mapping')}>Mapping nhà cung cấp</TabButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {drawerTab === 'info' ? (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    {editing ? (
                      <Button size="sm" variant="ghost" onClick={() => {
                        setEditing(false);
                        setEditProduct({
                          name: selected.name,
                          description: selected.description ?? '',
                          logoUrl: selected.logoUrl ?? '',
                          bannerUrl: selected.bannerUrl ?? '',
                        });
                      }}>Bỏ chỉnh sửa</Button>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Chỉnh sửa</Button>
                    )}
                  </div>
                  <Field label="Tên quốc gia" editing={editing} value={editProduct.name} onChange={(name) => setEditProduct((prev) => ({ ...prev, name }))} />
                  <div>
                    <Label>Slug</Label>
                    <p className="mt-1 text-sm text-slate-700">{selected.slug}</p>
                    <p className="text-xs text-slate-400">Slug không sửa được sau khi tạo.</p>
                  </div>
                  <div>
                    <Label>Danh mục catalog</Label>
                    <p className="mt-1 text-sm text-slate-700">{selected.category?.name ?? catalogCategory?.name ?? '—'}</p>
                    <p className="text-xs text-slate-400">Dùng chung cho mọi quốc gia. Quốc gia là sản phẩm, không phải danh mục.</p>
                  </div>
                  <div>
                    <Label>Mô tả</Label>
                    {editing ? (
                      <Textarea className="mt-1" value={editProduct.description} onChange={(event) => setEditProduct((prev) => ({ ...prev, description: event.target.value }))} />
                    ) : (
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{selected.description || '—'}</p>
                    )}
                  </div>
                  {editing ? (
                    <>
                      <MediaImageField label="Ảnh logo" value={editProduct.logoUrl} onChange={(logoUrl) => setEditProduct((prev) => ({ ...prev, logoUrl }))} />
                      <MediaImageField label="Ảnh banner" value={editProduct.bannerUrl} onChange={(bannerUrl) => setEditProduct((prev) => ({ ...prev, bannerUrl }))} />
                    </>
                  ) : (
                    <p className="text-sm text-slate-600">Logo: {selected.logoUrl ? 'đã có' : 'chưa có'} · Banner: {selected.bannerUrl ? 'đã có' : 'chưa có'}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {selected.status === 'ACTIVE' ? (
                      <Button size="sm" variant="ghost" onClick={() => askConfirm('Tắt sản phẩm trong catalog? Việc này không đổi cờ bán eSIM.', () => productAdminApi.disableProduct(selected.id))}>Tắt trong catalog</Button>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => askConfirm('Bật lại sản phẩm trong catalog? Việc này không mở bán eSIM.', () => productAdminApi.restoreProduct(selected.id))}>Bật trong catalog</Button>
                    )}
                  </div>
                </div>
              ) : null}

              {drawerTab === 'variants' ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Input className="min-w-[180px] flex-1" value={variantQuery} placeholder="Tìm SKU hoặc tên gói" onChange={(event) => setVariantQuery(event.target.value)} />
                    <Select className="w-auto" value={variantStatus} onChange={(event) => setVariantStatus(event.target.value as 'all' | 'ACTIVE' | 'INACTIVE')}>
                      <option value="all">Trạng thái: tất cả</option>
                      <option value="ACTIVE">Đang hoạt động</option>
                      <option value="INACTIVE">Ngừng hoạt động</option>
                    </Select>
                    <Button size="sm" onClick={() => setShowCreateVariant((prev) => !prev)}>Thêm biến thể</Button>
                  </div>
                  {showCreateVariant ? (
                    <div className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-2">
                      <Input value={newVariant.sku} placeholder="SKU" onChange={(event) => setNewVariant((prev) => ({ ...prev, sku: event.target.value }))} />
                      <Input value={newVariant.name} placeholder="Tên gói" onChange={(event) => setNewVariant((prev) => ({ ...prev, name: event.target.value }))} />
                      <Input value={newVariant.faceValue} placeholder="Mệnh giá catalog" onChange={(event) => setNewVariant((prev) => ({ ...prev, faceValue: event.target.value }))} />
                      <Input value={newVariant.sellPrice} placeholder="Giá catalog" onChange={(event) => setNewVariant((prev) => ({ ...prev, sellPrice: event.target.value }))} />
                      <Button size="sm" onClick={() => void createVariant()}>Lưu biến thể</Button>
                    </div>
                  ) : null}
                  <Table>
                    <THead>
                      <TR>
                        <TH>SKU</TH>
                        <TH>Gói</TH>
                        <TH>Giá catalog</TH>
                        <TH>Mapping</TH>
                        <TH>Trạng thái</TH>
                        <TH />
                      </TR>
                    </THead>
                    <TBody>
                      {visibleVariants.length === 0 ? <TableEmpty colSpan={6} message="Không có biến thể phù hợp." /> : null}
                      {visibleVariants.map((variant) => (
                        <TR key={variant.id}>
                          <TD>{variant.sku}</TD>
                          <TD>{planLabel(variant.sku, variant.name)}</TD>
                          <TD>{formatVnd(variant.sellPrice)}</TD>
                          <TD>{isMapped(variant) === null ? '—' : isMapped(variant) ? 'Đã mapping' : 'Chưa mapping'}</TD>
                          <TD><Badge tone={statusTone(variant.status)} status={variant.status} /></TD>
                          <TD>
                            <div className="flex flex-wrap gap-1">
                              <Button size="sm" variant="ghost" onClick={() => setEditVariant({ id: variant.id, name: variant.name, faceValue: String(variant.faceValue), sellPrice: String(variant.sellPrice) })}>Sửa</Button>
                              <Button size="sm" variant="ghost" onClick={() => { setDrawerTab('mapping'); void loadMappings(variant.id); }}>Mapping</Button>
                              {canCreateTestOrder && isEsimTestOrderVariant(variant, publishedVariantIds) ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={testBusy}
                                  onClick={() => setPendingTestVariant(variant)}
                                >
                                  {testBusy ? 'Đang tạo…' : 'Tạo đơn kiểm thử'}
                                </Button>
                              ) : null}
                              {variant.status === 'ACTIVE' ? (
                                <Button size="sm" variant="ghost" onClick={() => askConfirm('Tắt variant trong catalog?', () => productAdminApi.disableVariant(variant.id))}>Tắt</Button>
                              ) : (
                                <Button size="sm" variant="ghost" onClick={() => askConfirm('Bật lại variant trong catalog? Việc này không mở bán.', () => productAdminApi.restoreVariant(variant.id))}>Bật</Button>
                              )}
                            </div>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                  {editVariant ? (
                    <div className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-3">
                      <Input value={editVariant.name} onChange={(event) => setEditVariant({ ...editVariant, name: event.target.value })} />
                      <Input value={editVariant.faceValue} onChange={(event) => setEditVariant({ ...editVariant, faceValue: event.target.value })} placeholder="Mệnh giá catalog" />
                      <Input value={editVariant.sellPrice} onChange={(event) => setEditVariant({ ...editVariant, sellPrice: event.target.value })} placeholder="Giá catalog" />
                      <Button size="sm" onClick={() => void saveVariant()}>Lưu variant</Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {drawerTab === 'mapping' ? (
                <div className="space-y-3">
                  <div>
                    <Label>Biến thể</Label>
                    <Select className="mt-1" value={mappingVariantId} onChange={(event) => { const id = event.target.value; if (id) void loadMappings(id); else { setMappingVariantId(''); setMappings([]); } }}>
                      <option value="">Chọn biến thể</option>
                      {selectedVariants.map((variant) => (
                        <option key={variant.id} value={variant.id}>{variant.sku}</option>
                      ))}
                    </Select>
                  </div>
                  <p className="text-xs text-slate-500">Giá vốn là giá catalog của nhà cung cấp, không phải giá bán khách hàng.</p>
                  {mappings.length === 0 ? <p className="text-sm text-slate-500">Chưa chọn biến thể hoặc biến thể chưa có mapping.</p> : null}
                  <Table>
                    <THead>
                      <TR>
                        <TH>Nhà cung cấp</TH>
                        <TH>Mã gói</TH>
                        <TH>Giá vốn catalog</TH>
                        <TH>Ưu tiên</TH>
                        <TH>Trạng thái</TH>
                        <TH />
                      </TR>
                    </THead>
                    <TBody>
                      {mappings.map((mapping) => (
                        <TR key={mapping.id}>
                          <TD>{mapping.provider?.name ?? mapping.providerId}</TD>
                          <TD>{mapping.providerProductCode}</TD>
                          <TD>{formatVnd(mapping.providerCost)}</TD>
                          <TD>{mapping.priority}</TD>
                          <TD><Badge tone={statusTone(mapping.status)} status={mapping.status} /></TD>
                          <TD>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" onClick={() => setEditMapping({ id: mapping.id, providerProductCode: mapping.providerProductCode, providerCost: String(mapping.providerCost), priority: String(mapping.priority), status: mapping.status })}>Sửa</Button>
                              {mapping.status === 'ACTIVE' ? (
                                <Button size="sm" variant="ghost" onClick={() => askConfirm('Tắt mapping?', () => productAdminApi.disableProviderMapping(mapping.id).then(() => loadMappings(mappingVariantId)))}>Tắt</Button>
                              ) : (
                                <Button size="sm" variant="ghost" onClick={() => askConfirm('Bật mapping?', () => productAdminApi.enableProviderMapping(mapping.id).then(() => loadMappings(mappingVariantId)))}>Bật</Button>
                              )}
                            </div>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                  {editMapping ? (
                    <div className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-2">
                      <Input value={editMapping.providerProductCode} onChange={(event) => setEditMapping({ ...editMapping, providerProductCode: event.target.value })} />
                      <Input value={editMapping.providerCost} onChange={(event) => setEditMapping({ ...editMapping, providerCost: event.target.value })} />
                      <Input value={editMapping.priority} onChange={(event) => setEditMapping({ ...editMapping, priority: event.target.value })} />
                      <Select value={editMapping.status} onChange={(event) => setEditMapping({ ...editMapping, status: event.target.value })}>
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="INACTIVE">INACTIVE</option>
                      </Select>
                      <Button size="sm" onClick={() => void saveMapping()}>Lưu mapping</Button>
                    </div>
                  ) : null}
                  <div className="grid gap-2 rounded-lg border border-dashed border-slate-200 p-3 md:grid-cols-2">
                    <Select value={newMapping.providerId} onChange={(event) => setNewMapping((prev) => ({ ...prev, providerId: event.target.value }))}>
                      <option value="">Nhà cung cấp eSIM</option>
                      {esimProviders.map((provider) => (
                        <option key={provider.id} value={provider.id}>{provider.name}</option>
                      ))}
                    </Select>
                    {esimProviders.length === 0 ? (
                      <p className="text-xs text-amber-700 md:col-span-2">Chưa có nhà cung cấp eSIM. eSale không dùng cho eSIM.</p>
                    ) : null}
                    <Input value={newMapping.providerProductCode} placeholder="Mã gói nhà cung cấp" onChange={(event) => setNewMapping((prev) => ({ ...prev, providerProductCode: event.target.value }))} />
                    <Input value={newMapping.providerCost} placeholder="Giá vốn catalog" onChange={(event) => setNewMapping((prev) => ({ ...prev, providerCost: event.target.value }))} />
                    <Input value={newMapping.priority} placeholder="Độ ưu tiên" onChange={(event) => setNewMapping((prev) => ({ ...prev, priority: event.target.value }))} />
                    <Button size="sm" onClick={() => void createMapping()}>Tạo mapping</Button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <Button size="sm" variant="danger" onClick={() => askConfirm('Xóa sản phẩm eSIM này?', async () => { await productAdminApi.deleteProduct(selected.id); setDrawerOpen(false); })}>Xóa sản phẩm</Button>
              <Button size="sm" variant="ghost" onClick={() => setDrawerOpen(false)}>Hủy</Button>
              {editing ? <Button size="sm" onClick={() => void saveProduct()}>Lưu thay đổi</Button> : null}
            </div>
          </div>
        ) : null}
      </Drawer>

      <Dialog
        open={showCreateProduct}
        onClose={() => setShowCreateProduct(false)}
        title="Thêm quốc gia"
        footer={<Button size="sm" onClick={() => void createProduct()}>Thêm quốc gia</Button>}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Quốc gia mới là một sản phẩm trong danh mục {catalogCategory?.name ?? 'eSIM du lịch'}. Không tạo danh mục riêng cho từng quốc gia.
          </p>
          <div>
            <Label htmlFor="esim-product-name">Tên quốc gia</Label>
            <Input id="esim-product-name" value={newProduct.name} onChange={(event) => setNewProduct((prev) => ({ ...prev, name: event.target.value, slug: prev.slugManual ? prev.slug : slugify(event.target.value) }))} />
          </div>
          <div>
            <Label htmlFor="esim-product-slug">Slug</Label>
            <Input id="esim-product-slug" value={newProduct.slug} onChange={(event) => setNewProduct((prev) => ({ ...prev, slug: event.target.value, slugManual: true }))} />
          </div>
          <div>
            <Label htmlFor="esim-product-description">Mô tả</Label>
            <Textarea id="esim-product-description" value={newProduct.description} onChange={(event) => setNewProduct((prev) => ({ ...prev, description: event.target.value }))} />
          </div>
          <MediaImageField label="Ảnh logo" value={newProduct.logoUrl} onChange={(logoUrl) => setNewProduct((prev) => ({ ...prev, logoUrl }))} />
          <MediaImageField label="Ảnh banner" value={newProduct.bannerUrl} onChange={(bannerUrl) => setNewProduct((prev) => ({ ...prev, bannerUrl }))} />
          {productError ? <p className="text-sm text-red-700">{productError}</p> : null}
        </div>
      </Dialog>

      <AdminTestOrderDialog
        variant={pendingTestVariant}
        allowed={canCreateTestOrder}
        onClose={() => { setTestBusy(false); setPendingTestVariant(null); }}
        onBusy={setTestBusy}
        onVietQrCreated={(order) => { setTestOrder(order); setPaypalSnapshot(null); }}
        onPaypalReady={(next) => { setPaypalSnapshot(next); setTestOrder(null); }}
      />

      <Dialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title="Xác nhận"
        description={confirm?.title}
        className="z-[60]"
        footer={(
          <>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>Hủy</Button>
            <Button size="sm" variant="danger" onClick={() => void runConfirm()}>Xác nhận</Button>
          </>
        )}
      >
        <p className="text-sm text-slate-600">Thao tác này gọi API catalog hiện có.</p>
      </Dialog>
    </RequirePermission>
  );
}

function StatCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{note}</p>
    </Card>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${active ? 'bg-admin-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
    >
      {children}
    </button>
  );
}

function Field({ label, editing, value, onChange }: { label: string; editing: boolean; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      {editing ? <Input className="mt-1" value={value} onChange={(event) => onChange(event.target.value)} /> : <p className="mt-1 text-sm text-slate-700">{value || '—'}</p>}
    </div>
  );
}

function Pager({
  start,
  end,
  total,
  page,
  pageCount,
  pageSize,
  onPage,
  onPageSize,
}: {
  start: number;
  end: number;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
      <p>Hiển thị {start}–{end} trên {total}</p>
      <div className="flex items-center gap-2">
        <Select className="w-auto" value={String(pageSize)} onChange={(event) => onPageSize(Number(event.target.value))}>
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>{size} / trang</option>
          ))}
        </Select>
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Trước</Button>
        <span>{page}/{pageCount}</span>
        <Button size="sm" variant="ghost" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Sau</Button>
      </div>
    </div>
  );
}
