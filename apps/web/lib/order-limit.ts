export function formatVndPlain(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(amount)} đ`;
}

export type OrderAmountLimitDetails = {
  limit: number;
  current: number;
};

export function parseOrderAmountLimitError(error: {
  code?: string;
  message?: string;
  limit?: unknown;
  current?: unknown;
}): OrderAmountLimitDetails | null {
  if (error.code !== 'ORDER_AMOUNT_LIMIT') return null;
  const limit = Number(error.limit);
  const current = Number(error.current);
  if (!Number.isFinite(limit) || !Number.isFinite(current)) return null;
  return { limit, current };
}
