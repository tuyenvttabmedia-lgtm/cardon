-- Phase 1C Database Integrity Tests
-- Run: docker exec -i cardon-postgres psql -U postgres -d cardon -f - < prisma/tests/phase-1c-integrity.sql

BEGIN;

CREATE TEMP TABLE phase1c_results (
  test_group TEXT NOT NULL,
  test_case  TEXT NOT NULL,
  expected   TEXT NOT NULL,
  actual     TEXT NOT NULL,
  result     TEXT NOT NULL
);

-- Fixed test UUIDs (deterministic cleanup markers)
-- 11111111-1111-4111-8111-111111111101 .. 199

DO $setup$
DECLARE
  v_user_agent UUID := '11111111-1111-4111-8111-111111111101';
  v_agent      UUID := '11111111-1111-4111-8111-111111111102';
  v_ledger     UUID := '11111111-1111-4111-8111-111111111103';
  v_user_ord   UUID := '11111111-1111-4111-8111-111111111201';
  v_order      UUID := '11111111-1111-4111-8111-111111111202';
  v_order_item UUID := '11111111-1111-4111-8111-111111111203';
  v_card       UUID := '11111111-1111-4111-8111-111111111204';
  v_cat        UUID := '11111111-1111-4111-8111-111111111205';
  v_product    UUID := '11111111-1111-4111-8111-111111111206';
  v_variant    UUID := '11111111-1111-4111-8111-111111111207';
  v_user_uniq  UUID := '11111111-1111-4111-8111-111111111301';
  v_agent_uniq UUID := '11111111-1111-4111-8111-111111111302';
  v_order_a    UUID := '11111111-1111-4111-8111-111111111303';
  v_order_b    UUID := '11111111-1111-4111-8111-111111111304';
  v_payment_a  UUID := '11111111-1111-4111-8111-111111111305';
  v_payment_b  UUID := '11111111-1111-4111-8111-111111111306';
  v_user_soft  UUID := '11111111-1111-4111-8111-111111111401';
  v_order_soft UUID := '11111111-1111-4111-8111-111111111402';
  v_payment_soft UUID := '11111111-1111-4111-8111-111111111403';
BEGIN
  -- Cleanup prior run leftovers (best-effort; ledger rows may remain from failed prior runs)
  DELETE FROM card_records WHERE id = v_card;
  DELETE FROM order_items WHERE id = v_order_item;
  DELETE FROM payments WHERE id IN (v_payment_a, v_payment_b, v_payment_soft);
  DELETE FROM orders WHERE id IN (v_order, v_order_a, v_order_b, v_order_soft);
  DELETE FROM product_variants WHERE id = v_variant;
  DELETE FROM products WHERE id = v_product;
  DELETE FROM product_categories WHERE id = v_cat;
  DELETE FROM agents WHERE id IN (v_agent, v_agent_uniq);
  DELETE FROM users WHERE email LIKE 'phase1c-%@cardon.vn';

  -- ===================== TEST 1 SETUP: Ledger =====================
  INSERT INTO users (id, email, password_hash, role, status, updated_at)
  VALUES (v_user_agent, 'phase1c-ledger@cardon.vn', 'hash', 'AGENT', 'ACTIVE', NOW());

  INSERT INTO agents (id, user_id, company_name, updated_at)
  VALUES (v_agent, v_user_agent, 'Phase1C Ledger Test Agent', NOW());

  INSERT INTO ledger_entries (
    id, agent_id, type, before_balance, before_held, amount,
    after_balance, after_held, reference_type, reference_id, updated_at
  ) VALUES (
    v_ledger, v_agent, 'CREDIT', 0, 0, 100, 100, 0, 'ADJUSTMENT', v_agent, NOW()
  );

  -- TEST 1a: UPDATE ledger (expect FAIL)
  BEGIN
    UPDATE ledger_entries SET amount = 999 WHERE id = v_ledger;
    INSERT INTO phase1c_results VALUES ('TEST 1', 'UPDATE ledger_entries', 'FAIL', 'Succeeded (unexpected)', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase1c_results VALUES ('TEST 1', 'UPDATE ledger_entries', 'FAIL', 'Blocked: ' || SQLERRM, 'PASS');
  END;

  -- TEST 1b: DELETE ledger (expect FAIL)
  BEGIN
    DELETE FROM ledger_entries WHERE id = v_ledger;
    INSERT INTO phase1c_results VALUES ('TEST 1', 'DELETE ledger_entries', 'FAIL', 'Succeeded (unexpected)', 'FAIL');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase1c_results VALUES ('TEST 1', 'DELETE ledger_entries', 'FAIL', 'Blocked: ' || SQLERRM, 'PASS');
  END;

  -- ===================== TEST 2: Guest checkout =====================
  BEGIN
    INSERT INTO orders (
      id, order_code, channel, is_guest_order, guest_email, total_amount,
      payment_status, fulfillment_status, updated_at
    ) VALUES (
      gen_random_uuid(), 'PHASE1C-GUEST-FAIL', 'B2C', true, NULL, 100,
      'WAITING_PAYMENT', 'PENDING', NOW()
    );
    INSERT INTO phase1c_results VALUES ('TEST 2', 'Guest order without email', 'FAIL', 'Inserted (unexpected)', 'FAIL');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO phase1c_results VALUES ('TEST 2', 'Guest order without email', 'FAIL', 'Blocked: chk_guest_order_email', 'PASS');
  WHEN OTHERS THEN
    INSERT INTO phase1c_results VALUES ('TEST 2', 'Guest order without email', 'FAIL', 'Blocked: ' || SQLERRM, 'PASS');
  END;

  BEGIN
    INSERT INTO orders (
      id, order_code, channel, is_guest_order, guest_email, total_amount,
      payment_status, fulfillment_status, updated_at
    ) VALUES (
      gen_random_uuid(), 'PHASE1C-GUEST-PASS', 'B2C', true, 'guest@test.cardon.vn', 100,
      'WAITING_PAYMENT', 'PENDING', NOW()
    );
    INSERT INTO phase1c_results VALUES ('TEST 2', 'Guest order with email', 'PASS', 'Inserted successfully', 'PASS');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase1c_results VALUES ('TEST 2', 'Guest order with email', 'PASS', 'Failed: ' || SQLERRM, 'FAIL');
  END;

  -- ===================== TEST 3: Delete agent with ledger =====================
  BEGIN
    DELETE FROM agents WHERE id = v_agent;
    INSERT INTO phase1c_results VALUES ('TEST 3', 'DELETE agent with ledger', 'FAIL', 'Deleted (unexpected)', 'FAIL');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO phase1c_results VALUES ('TEST 3', 'DELETE agent with ledger', 'FAIL', 'Blocked: FK restrict (ledger exists)', 'PASS');
  WHEN OTHERS THEN
    INSERT INTO phase1c_results VALUES ('TEST 3', 'DELETE agent with ledger', 'FAIL', 'Blocked: ' || SQLERRM, 'PASS');
  END;

  -- ===================== TEST 4 SETUP: Order chain =====================
  INSERT INTO users (id, email, password_hash, role, status, updated_at)
  VALUES (v_user_ord, 'phase1c-order@cardon.vn', 'hash', 'CUSTOMER', 'ACTIVE', NOW());

  INSERT INTO product_categories (id, slug, name, status, updated_at)
  VALUES (v_cat, 'phase1c-cat', 'Phase1C Cat', 'ACTIVE', NOW());

  INSERT INTO products (id, category_id, slug, name, status, updated_at)
  VALUES (v_product, v_cat, 'phase1c-product', 'Phase1C Product', 'ACTIVE', NOW());

  INSERT INTO product_variants (id, product_id, sku, name, type, face_value, sell_price, status, updated_at)
  VALUES (v_variant, v_product, 'PHASE1C-SKU', 'Phase1C Variant', 'CARD', 100, 100, 'ACTIVE', NOW());

  INSERT INTO orders (
    id, order_code, channel, user_id, total_amount, payment_status, fulfillment_status, updated_at
  ) VALUES (
    v_order, 'PHASE1C-ORD-001', 'B2C', v_user_ord, 100, 'WAITING_PAYMENT', 'PENDING', NOW()
  );

  INSERT INTO order_items (id, order_id, variant_id, quantity, unit_price, total_amount)
  VALUES (v_order_item, v_order, v_variant, 1, 100, 100);

  INSERT INTO card_records (id, order_item_id, encrypted_serial, encrypted_pin)
  VALUES (v_card, v_order_item, 'enc-serial', 'enc-pin');

  BEGIN
    DELETE FROM orders WHERE id = v_order;
    INSERT INTO phase1c_results VALUES ('TEST 4', 'DELETE order with children', 'FAIL', 'Deleted (unexpected)', 'FAIL');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO phase1c_results VALUES ('TEST 4', 'DELETE order with children', 'FAIL', 'Blocked: FK restrict (children exist)', 'PASS');
  WHEN OTHERS THEN
    INSERT INTO phase1c_results VALUES ('TEST 4', 'DELETE order with children', 'FAIL', 'Blocked: ' || SQLERRM, 'PASS');
  END;

  -- ===================== TEST 5: Unique constraints =====================
  INSERT INTO users (id, email, password_hash, role, status, updated_at)
  VALUES (v_user_uniq, 'phase1c-unique@cardon.vn', 'hash', 'AGENT', 'ACTIVE', NOW());

  INSERT INTO agents (id, user_id, company_name, updated_at)
  VALUES (v_agent_uniq, v_user_uniq, 'Phase1C Unique Test Agent', NOW());

  INSERT INTO orders (id, order_code, agent_id, agent_request_id, channel, total_amount, payment_status, fulfillment_status, updated_at)
  VALUES (v_order_a, 'PHASE1C-UNIQ-A', v_agent_uniq, 'req-phase1c-001', 'AGENT', 100, 'WAITING_PAYMENT', 'PENDING', NOW());

  INSERT INTO orders (id, order_code, agent_id, agent_request_id, channel, total_amount, payment_status, fulfillment_status, updated_at)
  VALUES (v_order_b, 'PHASE1C-UNIQ-B', v_agent_uniq, 'req-phase1c-002', 'AGENT', 100, 'WAITING_PAYMENT', 'PENDING', NOW());

  INSERT INTO payments (id, order_id, gateway, payment_reference, amount, updated_at)
  VALUES (v_payment_a, v_order_a, 'MEGAPAY', 'PHASE1C-PAY-REF-001', 100, NOW());

  BEGIN
    INSERT INTO payments (id, order_id, gateway, payment_reference, amount, updated_at)
    VALUES (v_payment_b, v_order_b, 'MEGAPAY', 'PHASE1C-PAY-REF-001', 100, NOW());
    INSERT INTO phase1c_results VALUES ('TEST 5', 'Duplicate payment_reference', 'FAIL', 'Inserted (unexpected)', 'FAIL');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO phase1c_results VALUES ('TEST 5', 'Duplicate payment_reference', 'FAIL', 'Blocked: unique payment_reference', 'PASS');
  WHEN OTHERS THEN
    INSERT INTO phase1c_results VALUES ('TEST 5', 'Duplicate payment_reference', 'FAIL', 'Blocked: ' || SQLERRM, 'PASS');
  END;

  BEGIN
    INSERT INTO orders (id, order_code, agent_id, agent_request_id, channel, total_amount, payment_status, fulfillment_status, updated_at)
    VALUES (gen_random_uuid(), 'PHASE1C-UNIQ-C', v_agent_uniq, 'req-phase1c-001', 'AGENT', 100, 'WAITING_PAYMENT', 'PENDING', NOW());
    INSERT INTO phase1c_results VALUES ('TEST 5', 'Duplicate (agent_id, agent_request_id)', 'FAIL', 'Inserted (unexpected)', 'FAIL');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO phase1c_results VALUES ('TEST 5', 'Duplicate (agent_id, agent_request_id)', 'FAIL', 'Blocked: unique agent request', 'PASS');
  WHEN OTHERS THEN
    INSERT INTO phase1c_results VALUES ('TEST 5', 'Duplicate (agent_id, agent_request_id)', 'FAIL', 'Blocked: ' || SQLERRM, 'PASS');
  END;

  -- ===================== TEST 6: Soft delete vs physical delete =====================
  INSERT INTO users (id, email, password_hash, role, status, updated_at)
  VALUES (v_user_soft, 'phase1c-soft@cardon.vn', 'hash', 'CUSTOMER', 'ACTIVE', NOW());

  INSERT INTO orders (id, order_code, channel, user_id, total_amount, payment_status, fulfillment_status, updated_at)
  VALUES (v_order_soft, 'PHASE1C-SOFT-001', 'B2C', v_user_soft, 50, 'WAITING_PAYMENT', 'PENDING', NOW());

  INSERT INTO payments (id, order_id, gateway, payment_reference, amount, updated_at)
  VALUES (v_payment_soft, v_order_soft, 'SEPAY', 'PHASE1C-PAY-SOFT-001', 50, NOW());

  UPDATE orders SET payment_id = v_payment_soft WHERE id = v_order_soft;

  BEGIN
    UPDATE users SET deleted_at = NOW(), status = 'SUSPENDED' WHERE id = v_user_soft;
    INSERT INTO phase1c_results VALUES ('TEST 6', 'UPDATE deleted_at (soft delete)', 'PASS', 'Updated successfully', 'PASS');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO phase1c_results VALUES ('TEST 6', 'UPDATE deleted_at (soft delete)', 'PASS', 'Failed: ' || SQLERRM, 'FAIL');
  END;

  BEGIN
    DELETE FROM payments WHERE id = v_payment_soft;
    INSERT INTO phase1c_results VALUES ('TEST 6', 'DELETE payment (financial)', 'FAIL', 'Deleted (unexpected)', 'FAIL');
  EXCEPTION WHEN foreign_key_violation THEN
    INSERT INTO phase1c_results VALUES ('TEST 6', 'DELETE payment (financial)', 'FAIL', 'Blocked: FK restrict from order', 'PASS');
  WHEN OTHERS THEN
    INSERT INTO phase1c_results VALUES ('TEST 6', 'DELETE payment (financial)', 'FAIL', 'Blocked: ' || SQLERRM, 'PASS');
  END;

END $setup$;

-- Output results
SELECT test_group, test_case, expected, actual, result FROM phase1c_results ORDER BY test_group, test_case;

-- Summary
SELECT result, COUNT(*) AS cnt FROM phase1c_results GROUP BY result ORDER BY result;

ROLLBACK;
