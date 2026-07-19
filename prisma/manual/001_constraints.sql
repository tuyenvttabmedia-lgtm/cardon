-- CardOn.vn — manual PostgreSQL constraints (Phase 1B)
-- Apply after: prisma migrate dev --name init_cardon_schema
-- Run: npm run db:manual

-- =============================================================================
-- Guest checkout constraint
-- =============================================================================

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS chk_guest_order_email;

ALTER TABLE orders
  ADD CONSTRAINT chk_guest_order_email
  CHECK (NOT is_guest_order OR guest_email IS NOT NULL);

-- =============================================================================
-- Payment expiration partial index
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_payment_expires_waiting
  ON orders (payment_expires_at)
  WHERE payment_status = 'WAITING_PAYMENT';

-- =============================================================================
-- Guest email partial index (from architecture audit)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_guest_email_guest
  ON orders (guest_email)
  WHERE is_guest_order = true;

-- =============================================================================
-- Soft delete partial indexes (active-record lookups)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_users_active
  ON users (id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agents_active
  ON agents (id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_active
  ON products (id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_product_variants_active
  ON product_variants (id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_providers_active
  ON providers (id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orders_active
  ON orders (order_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payments_active
  ON payments (payment_reference)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_active
  ON transactions (transaction_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_provider_transactions_active
  ON provider_transactions (request_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_active
  ON invoices (invoice_number)
  WHERE deleted_at IS NULL;

-- =============================================================================
-- Ledger append-only protection
-- =============================================================================

CREATE OR REPLACE FUNCTION prevent_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only: UPDATE and DELETE are forbidden';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_no_update ON ledger_entries;
CREATE TRIGGER trg_ledger_no_update
  BEFORE UPDATE ON ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_ledger_mutation();

DROP TRIGGER IF EXISTS trg_ledger_no_delete ON ledger_entries;
CREATE TRIGGER trg_ledger_no_delete
  BEFORE DELETE ON ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_ledger_mutation();
