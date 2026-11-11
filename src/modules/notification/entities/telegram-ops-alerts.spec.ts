import {
  displayProviderName,
  formatAdminRetryTelegram,
  formatProviderLowBalanceTelegram,
} from './telegram-ops-alerts';

describe('telegram-ops-alerts', () => {
  it('strips Mock Local from provider display name', () => {
    expect(displayProviderName('eSale (Mock Local)', 'ESALE')).toBe('eSale');
    expect(displayProviderName('eSale', 'ESALE')).toBe('eSale');
  });

  it('formats low-balance alert in Vietnamese', () => {
    const { title, body } = formatProviderLowBalanceTelegram({
      providerName: 'eSale (Mock Local)',
      providerCode: 'ESALE',
      balance: 0,
      threshold: 5_000_000,
    });
    expect(title).toContain('eSale');
    expect(body).toContain('SỐ DƯ NCC THẤP');
    expect(body).toContain('Số dư:');
    expect(body).toContain('Ngưỡng cảnh báo:');
    expect(body).not.toMatch(/Mock Local|LOW_BALANCE|Current balance/i);
  });

  it('formats admin-retry alert concise Vietnamese for TOPUP', () => {
    const { body } = formatAdminRetryTelegram({
      orderCode: 'ORD-20260723-ADD2B4',
      variantType: 'TOPUP',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'WAITING_ADMIN_RETRY',
      phone: '0933333333',
      telco: 'Mobifone',
      amount: 100_000,
      orderTotal: 100_000,
      failureCode: 'UNKNOWN',
      retCode: -1,
      retMsg: 'Fail',
      providerMessage: 'Loi giao dich that bai',
      providerDebited: 91_000,
      requestId: 'PRV-1',
      esaleId: 'UP123P260723-1000005',
      attempt: 1,
    });
    expect(body).toContain('CẦN GIAO LẠI');
    expect(body).toContain('Đã thanh toán');
    expect(body).toContain('Chờ admin giao lại');
    expect(body).toContain('Khách trả:');
    expect(body).toContain('Lỗi không xác định');
    expect(body).toContain('không nạp lại');
    expect(body).toContain('Đã trừ ví NCC:');
    expect(body).not.toMatch(/Request ID|topupType|totalAmount|Lỗi CardOn/);
  });

  it('shows CARD qty × face and order total; hides provider debit on LOW_BALANCE', () => {
    const { body } = formatAdminRetryTelegram({
      orderCode: 'ORD-20261111-01489C',
      variantType: 'CARD',
      paymentStatus: 'PAID',
      fulfillmentStatus: 'WAITING_ADMIN_RETRY',
      phone: '—',
      telco: '—',
      amount: 500_000,
      quantity: 50,
      productLabel: 'Garena 500k',
      orderTotal: 24_625_000,
      failureCode: 'LOW_BALANCE',
      retCode: -3000,
      retMsg: 'Not Enough Money',
      providerMessage: '—',
      providerDebited: 23_650_000,
      requestId: 'PRV-1',
      esaleId: '—',
      attempt: 1,
    });
    expect(body).toContain('Garena 500k');
    expect(body).toContain('SL 50');
    expect(body).toContain('Mệnh giá 500.000đ');
    expect(body).toContain('Khách trả: 24.625.000đ');
    expect(body).toContain('Hết số dư NCC');
    expect(body).not.toContain('Đã trừ ví NCC');
    expect(body).not.toMatch(/— · — · 500/);
  });
});
