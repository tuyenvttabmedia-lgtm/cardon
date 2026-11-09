import type { AbuseBucket, AbuseDimension } from './abuse-rate-limit.constants';

export type AbuseConsumeInput = {
  bucket: AbuseBucket;
  ip?: string | null;
  userId?: string | null;
  email?: string | null;
};

export type AbuseDimensionValue = {
  dimension: AbuseDimension;
  value: string;
};
