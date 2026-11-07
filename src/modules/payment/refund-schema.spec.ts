import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const schema = readFileSync(join(root, 'prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  join(root, 'prisma/migrations/20261027160000_refund_request_attempt/migration.sql'),
  'utf8',
);

function paymentRecordStatusBlock(source: string): string {
  const match = source.match(/enum PaymentRecordStatus \{[\s\S]*?\}/);
  if (!match) {
    throw new Error('PaymentRecordStatus enum missing');
  }
  return match[0];
}

describe('REFUND-02 schema', () => {
  it('adds refund request and attempt models without PaymentRecordStatus.REFUNDED', () => {
    expect(schema).toContain('model RefundRequest');
    expect(schema).toContain('model RefundAttempt');
    expect(schema).toContain('enum RefundRequestStatus');
    expect(schema).toContain('enum RefundAttemptStatus');
    expect(schema).toContain('enum RefundReconStatus');
    expect(schema).toContain('enum RefundIntendedMethod');
    expect(schema).toContain('enum RefundEsimGate');
    expect(schema).toContain('enum RefundCurrency');
    expect(schema).toContain('BANK_PAYOUT');
    expect(schema).toContain('SEPAY_PG_VOID');
    expect(schema).toContain('SEPAY_PG_REFUND');
    expect(schema).toContain('PAYPAL_REFUND');
    expect(schema).toContain('MANUAL_OTHER');
    expect(schema).not.toContain('SEPAY_CARD');
    expect(schema).not.toContain('VISA_MASTERCARD');
    expect(paymentRecordStatusBlock(schema)).not.toContain('REFUNDED');
  });

  it('requires currency and unique idempotency/open-guard on attempts', () => {
    expect(schema).toMatch(/currency\s+RefundCurrency/);
    expect(schema).toMatch(/idempotencyKey\s+String\s+@unique/);
    expect(schema).toMatch(/openGuard\s+String\?\s+@unique/);
    expect(schema).toContain('@@index([paymentId, status])');
    expect(schema).toContain('@@index([requestId, status])');
    expect(schema).toContain('@@map("refund_requests")');
    expect(schema).toContain('@@map("refund_attempts")');
  });

  it('keeps refund recon off payments.reconciliation_status', () => {
    expect(schema).toContain('enum RefundReconStatus');
    expect(schema).toContain('PENDING_VERIFY');
    expect(schema).toMatch(/reconStatus\s+RefundReconStatus/);
  });

  it('migration is additive and does not mutate orders, payments, or seed refunds', () => {
    expect(migration).toContain('CREATE TABLE "refund_requests"');
    expect(migration).toContain('CREATE TABLE "refund_attempts"');
    expect(migration).toContain('CREATE UNIQUE INDEX "refund_attempts_idempotency_key_key"');
    expect(migration).toContain('CREATE UNIQUE INDEX "refund_attempts_open_guard_key"');
    expect(migration).not.toMatch(/ALTER TABLE "orders"/);
    expect(migration).not.toMatch(/ALTER TABLE "payments"/);
    expect(migration).not.toMatch(/(?:^|\n)\s*(INSERT|UPDATE|DELETE)\s/i);
    expect(migration).not.toContain('ORD-20261024-31732F');
    expect(migration).not.toContain("ADD VALUE 'REFUNDED'");
  });
});
