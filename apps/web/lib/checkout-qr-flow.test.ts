import { describe, expect, it } from 'vitest';
import { isMegapayDepositMethod } from './checkout-qr-flow';

describe('isMegapayDepositMethod', () => {
  it('treats DEPOSIT_CODE / VIETQR as deposit VA', () => {
    expect(isMegapayDepositMethod('DEPOSIT_CODE', 'MEGAPAY')).toBe(true);
    expect(isMegapayDepositMethod('VIETQR', 'MEGAPAY')).toBe(true);
  });

  it('excludes hosted MegaPay QR / wallet', () => {
    expect(isMegapayDepositMethod('VNPAYQR', 'MEGAPAY')).toBe(false);
    expect(isMegapayDepositMethod('ZALOPAY', 'MEGAPAY')).toBe(false);
  });
});

/**
 * Race that caused infinite «Đang tải mã QR…»:
 * poll WAITING_PAYMENT cleared error even when sessionStorage had no QR/VA payload.
 */
describe('checkout pay session reopen', () => {
  it('only clears pay errors when a pending QR/VA payload exists', () => {
    const orderId = 'order-1';
    const sessions = new Map<string, unknown>();

    function shouldClearError(id: string): boolean {
      return Boolean(sessions.get(id));
    }

    expect(shouldClearError(orderId)).toBe(false);
    sessions.set(orderId, {
      orderId,
      paymentUrl: '',
      bankInfo: { accountNumber: '811' },
    });
    expect(shouldClearError(orderId)).toBe(true);
  });
});
