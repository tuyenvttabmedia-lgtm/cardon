import { ProviderFailureCode } from '../interfaces/provider.interface';

/** Errors that allow trying the next provider mapping (priority failover). */
export function isProviderFailoverEligible(code?: ProviderFailureCode): boolean {
  return (
    code === 'OUT_OF_STOCK' ||
    code === 'LOW_BALANCE' ||
    code === 'MAINTENANCE'
  );
}

/** Timeout/pending should retry checkTransaction on the same provider first. */
export function isProviderPendingRetry(code?: ProviderFailureCode): boolean {
  return code === 'TIMEOUT';
}
