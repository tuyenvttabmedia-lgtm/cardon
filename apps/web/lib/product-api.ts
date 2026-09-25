import type { Product } from '@/types/api';
import { getApiBaseUrl } from '@/lib/utils';

interface ApiSuccess<T> {
  success: true;
  data: T;
}

async function productFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      next: { revalidate: 300, tags: ['products'] },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return null;
    const payload = (await res.json()) as ApiSuccess<T>;
    return payload.data;
  } catch {
    return null;
  }
}

export function listActiveProducts() {
  return productFetch<Product[]>('/products');
}

export function getProductBySlug(slug: string) {
  return productFetch<Product>(`/products/by-slug/${encodeURIComponent(slug)}`);
}
