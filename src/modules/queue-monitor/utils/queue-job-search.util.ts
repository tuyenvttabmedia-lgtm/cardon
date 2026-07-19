import { Job } from 'bullmq';

const SEARCH_KEYS = [
  'orderId',
  'order_id',
  'paymentId',
  'payment_id',
  'requestId',
  'request_id',
  'correlationId',
  'correlation_id',
  'customerEmail',
  'customer_email',
  'email',
  'providerTransaction',
  'provider_transaction',
  'transactionId',
  'transaction_id',
] as const;

export function jobSearchHaystack(job: Job): string {
  const data = job.data as Record<string, unknown> | undefined;
  const parts: string[] = [String(job.id ?? ''), job.name ?? ''];
  if (data) {
    for (const key of SEARCH_KEYS) {
      const val = data[key];
      if (val != null) parts.push(String(val));
    }
    try {
      parts.push(JSON.stringify(data));
    } catch {
      // ignore
    }
  }
  return parts.join(' ').toLowerCase();
}

export function matchesJobSearch(job: Job, needle: string): boolean {
  return jobSearchHaystack(job).includes(needle.trim().toLowerCase());
}
