/** Master Spec v1.0 Appendix B — FactRef (backend source of truth). */
export type FactRefType = 'product_variant';

export interface FactRefSnapshot {
  productName: string;
  variantName: string;
  faceValueVnd: string;
  sellPriceVnd: string;
  sku: string;
  status: string;
}

export interface FactRef {
  refId: string;
  type: FactRefType;
  sourceId: string;
  snapshot: FactRefSnapshot;
}

export interface FactContext {
  refs: FactRef[];
  source: 'BACKEND';
}
