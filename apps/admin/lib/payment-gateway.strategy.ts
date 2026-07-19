export const MVP_PAYMENT_GATEWAYS = [

  { code: 'SEPAY' as const, label: 'SePay' },

  { code: 'MEGAPAY' as const, label: 'MegaPay' },

];



export const COMING_SOON_PAYMENT_GATEWAYS = [

  { id: 'payos', label: 'PayOS' },

  { id: 'momo', label: 'MoMo' },

  { id: 'zalopay', label: 'ZaloPay' },

  { id: 'vnpay', label: 'VNPay' },

];



export const DEFAULT_PAYMENT_GATEWAY = 'SEPAY' as const;



export function priorityOrderLabel(priority: number): string {

  const labels = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];

  return labels[priority - 1] ?? String(priority);

}



export function validateGatewayPrioritiesClient(

  gateways: Array<{ code: string; priority?: number | null }>,

): string | null {

  const seen = new Set<number>();

  for (const gateway of gateways) {

    if (gateway.priority == null || !Number.isFinite(gateway.priority)) {

      return 'Priority không được để trống.';

    }

    if (gateway.priority <= 0) {

      return 'Priority phải lớn hơn 0.';

    }

    if (seen.has(gateway.priority)) {

      return 'Priority đã được sử dụng bởi Gateway khác.';

    }

    seen.add(gateway.priority);

  }

  return null;

}

