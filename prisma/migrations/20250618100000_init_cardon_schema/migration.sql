-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'AGENT', 'SUPPORT', 'MARKETING', 'ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AgentKycStatus" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AgentProductPriceStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProductCategoryStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "CatalogProductStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProductVariantType" AS ENUM ('CARD', 'TOPUP', 'DATA', 'SOFTWARE');

-- CreateEnum
CREATE TYPE "ProductVariantStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProviderProductMappingStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PaymentGatewayStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "FinancialTransactionType" AS ENUM ('AGENT_ORDER', 'B2C_CHECKOUT', 'ADMIN_TOPUP');

-- CreateEnum
CREATE TYPE "FinancialTransactionStatus" AS ENUM ('PENDING', 'HOLD', 'COMPLETED', 'RELEASED', 'FAILED');

-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('B2C', 'AGENT');

-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM ('WAITING_PAYMENT', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'WAITING_ADMIN_RETRY');

-- CreateEnum
CREATE TYPE "OrderItemStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "CardRecordStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "TopupTransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentGatewayCode" AS ENUM ('MEGAPAY', 'SEPAY');

-- CreateEnum
CREATE TYPE "PaymentRecordStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('CREDIT', 'DEBIT', 'HOLD', 'RELEASE');

-- CreateEnum
CREATE TYPE "LedgerReferenceType" AS ENUM ('TRANSACTION', 'ORDER', 'TOPUP', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ProviderTransactionAction" AS ENUM ('BUY_CARD', 'TOPUP', 'CHECK');

-- CreateEnum
CREATE TYPE "ProviderTransactionStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "WebhookSource" AS ENUM ('MEGAPAY', 'SEPAY');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('B2C_RECEIPT', 'AGENT_STATEMENT', 'AGENT_TOPUP_RECEIPT', 'MONTHLY_SUMMARY');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOID');

-- CreateEnum
CREATE TYPE "AuditTargetType" AS ENUM ('ORDER', 'AGENT', 'PRODUCT', 'USER', 'INVOICE');

-- CreateEnum
CREATE TYPE "ReconcileDomain" AS ENUM ('PAYMENT', 'PROVIDER', 'LEDGER', 'ORDER_REVENUE');

-- CreateEnum
CREATE TYPE "ReconcileReportStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReconcileMatchStatus" AS ENUM ('MATCHED', 'MISSING_LOCAL', 'MISSING_GATEWAY', 'AMOUNT_MISMATCH', 'STATUS_MISMATCH');

-- CreateEnum
CREATE TYPE "ReconcileResolution" AS ENUM ('OPEN', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "NotificationRecipientType" AS ENUM ('USER', 'AGENT', 'ADMIN_ROLE');

-- CreateEnum
CREATE TYPE "NotificationRecipientRole" AS ENUM ('SUPPORT', 'MARKETING', 'ACCOUNTANT', 'ADMIN');

-- CreateEnum
CREATE TYPE "CmsPageType" AS ENUM ('PAGE', 'PRODUCT_LANDING', 'BLOG_POST');

-- CreateEnum
CREATE TYPE "CmsPageStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CmsBannerPosition" AS ENUM ('HOME_HERO', 'HOME_SIDEBAR', 'CATEGORY_TOP');

-- CreateEnum
CREATE TYPE "CmsBannerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(32),
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "email_verified_at" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "company_name" VARCHAR(255) NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "held_balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "api_key_hash" VARCHAR(255),
    "secret_key_encrypted" TEXT,
    "last_used_at" TIMESTAMPTZ(6),
    "contact_email" VARCHAR(255),
    "rate_limit" INTEGER NOT NULL DEFAULT 100,
    "api_enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_kyc" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "company_name" VARCHAR(255) NOT NULL,
    "tax_code" VARCHAR(64) NOT NULL,
    "representative_name" VARCHAR(255) NOT NULL,
    "document_front" VARCHAR(512) NOT NULL,
    "document_back" VARCHAR(512) NOT NULL,
    "business_license" VARCHAR(512) NOT NULL,
    "status" "AgentKycStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agent_kyc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_product_prices" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "agent_price" DECIMAL(18,2) NOT NULL,
    "status" "AgentProductPriceStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agent_product_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_webhook_configs" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "callback_url" VARCHAR(512) NOT NULL,
    "events" JSONB NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agent_webhook_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(128) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "parent_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "ProductCategoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "slug" VARCHAR(128) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" "CatalogProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" VARCHAR(128) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "ProductVariantType" NOT NULL,
    "face_value" DECIMAL(18,2) NOT NULL,
    "sell_price" DECIMAL(18,2) NOT NULL,
    "status" "ProductVariantStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_product_mappings" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "product_variant_id" UUID NOT NULL,
    "provider_product_code" VARCHAR(128) NOT NULL,
    "provider_cost" DECIMAL(18,2) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "health_score" DECIMAL(18,4) NOT NULL DEFAULT 100,
    "status" "ProviderProductMappingStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "provider_product_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "api_credentials" TEXT NOT NULL,
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "last_balance_synced_at" TIMESTAMPTZ(6),
    "last_product_synced_at" TIMESTAMPTZ(6),
    "status" "ProviderStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_transactions" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "provider_transaction_id" VARCHAR(128),
    "provider_reference" VARCHAR(128),
    "request_id" VARCHAR(128) NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "action" "ProviderTransactionAction" NOT NULL,
    "status" "ProviderTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "request_payload" JSONB NOT NULL DEFAULT '{}',
    "response_payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "provider_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_logs" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "order_id" UUID,
    "request_id" VARCHAR(128),
    "action" "ProviderTransactionAction",
    "status" "ProviderTransactionStatus",
    "request_payload" JSONB,
    "response_payload" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_gateways" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "config_encrypted" TEXT NOT NULL,
    "status" "PaymentGatewayStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_gateways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "gateway" "PaymentGatewayCode" NOT NULL,
    "payment_reference" VARCHAR(128) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "PaymentRecordStatus" NOT NULL DEFAULT 'PENDING',
    "gateway_response" JSONB NOT NULL DEFAULT '{}',
    "paid_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "transaction_id" VARCHAR(64) NOT NULL,
    "agent_id" UUID,
    "type" "FinancialTransactionType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "FinancialTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_code" VARCHAR(64) NOT NULL,
    "transaction_id" UUID,
    "user_id" UUID,
    "agent_id" UUID,
    "agent_request_id" VARCHAR(128),
    "channel" "OrderChannel" NOT NULL,
    "guest_email" VARCHAR(255),
    "guest_phone" VARCHAR(32),
    "is_guest_order" BOOLEAN NOT NULL DEFAULT false,
    "invoice_required" BOOLEAN NOT NULL DEFAULT false,
    "customer_note" VARCHAR(512),
    "total_amount" DECIMAL(18,2) NOT NULL,
    "payment_status" "OrderPaymentStatus" NOT NULL DEFAULT 'WAITING_PAYMENT',
    "fulfillment_status" "FulfillmentStatus" NOT NULL DEFAULT 'PENDING',
    "payment_id" UUID,
    "payment_expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "status" "OrderItemStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_records" (
    "id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "encrypted_serial" TEXT NOT NULL,
    "encrypted_pin" TEXT NOT NULL,
    "provider_response" JSONB NOT NULL DEFAULT '{}',
    "status" "CardRecordStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topup_transactions" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "phone_number" VARCHAR(32) NOT NULL,
    "telco" VARCHAR(64) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "provider_reference" VARCHAR(128),
    "status" "TopupTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "result_message" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "topup_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "before_balance" DECIMAL(18,2) NOT NULL,
    "before_held" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "after_balance" DECIMAL(18,2) NOT NULL,
    "after_held" DECIMAL(18,2) NOT NULL,
    "reference_type" "LedgerReferenceType" NOT NULL,
    "reference_id" UUID NOT NULL,
    "description" VARCHAR(512),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "invoice_number" VARCHAR(32) NOT NULL,
    "type" "InvoiceType" NOT NULL,
    "order_id" UUID,
    "agent_id" UUID,
    "user_id" UUID,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issued_at" TIMESTAMPTZ(6),
    "pdf_url" VARCHAR(512),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconcile_reports" (
    "id" UUID NOT NULL,
    "domain" "ReconcileDomain" NOT NULL,
    "gateway_or_provider" VARCHAR(64),
    "report_date" DATE NOT NULL,
    "total_matched" INTEGER NOT NULL DEFAULT 0,
    "total_mismatch" INTEGER NOT NULL DEFAULT 0,
    "status" "ReconcileReportStatus" NOT NULL DEFAULT 'PENDING',
    "summary" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconcile_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconcile_items" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "match_status" "ReconcileMatchStatus" NOT NULL,
    "reference" VARCHAR(128) NOT NULL,
    "local_amount" DECIMAL(18,2),
    "external_amount" DECIMAL(18,2),
    "resolution" "ReconcileResolution" NOT NULL DEFAULT 'OPEN',
    "resolution_note" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconcile_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_logs" (
    "id" UUID NOT NULL,
    "source" "WebhookSource" NOT NULL,
    "payment_reference" VARCHAR(128) NOT NULL,
    "payload" JSONB NOT NULL,
    "signature_valid" BOOLEAN NOT NULL,
    "ip_address" VARCHAR(64),
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "value" JSONB NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_type" "NotificationRecipientType" NOT NULL,
    "recipient_id" UUID,
    "recipient_role" "NotificationRecipientRole",
    "type" VARCHAR(64) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "action" VARCHAR(128) NOT NULL,
    "target_type" "AuditTargetType" NOT NULL,
    "target_id" UUID NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_pages" (
    "id" UUID NOT NULL,
    "type" "CmsPageType" NOT NULL,
    "slug" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "content" TEXT NOT NULL,
    "excerpt" VARCHAR(512),
    "featured_image" VARCHAR(512),
    "status" "CmsPageStatus" NOT NULL DEFAULT 'DRAFT',
    "author_id" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cms_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_seo" (
    "id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "meta_title" VARCHAR(128) NOT NULL,
    "meta_description" VARCHAR(256) NOT NULL,
    "meta_keywords" VARCHAR(256),
    "og_title" VARCHAR(128),
    "og_description" VARCHAR(256),
    "og_image" VARCHAR(512),
    "canonical_url" VARCHAR(512),
    "robots" VARCHAR(64) NOT NULL DEFAULT 'index,follow',
    "structured_data" JSONB,

    CONSTRAINT "cms_seo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cms_banners" (
    "id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "image_url" VARCHAR(512) NOT NULL,
    "link_url" VARCHAR(512),
    "position" "CmsBannerPosition" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "CmsBannerStatus" NOT NULL DEFAULT 'ACTIVE',
    "start_at" TIMESTAMPTZ(6),
    "end_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cms_banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permissions_code_idx" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "role_permissions_role_idx" ON "role_permissions"("role");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_permission_id_key" ON "role_permissions"("role", "permission_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "agents_user_id_key" ON "agents"("user_id");

-- CreateIndex
CREATE INDEX "agents_deleted_at_idx" ON "agents"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "agent_kyc_agent_id_key" ON "agent_kyc"("agent_id");

-- CreateIndex
CREATE INDEX "agent_kyc_status_idx" ON "agent_kyc"("status");

-- CreateIndex
CREATE UNIQUE INDEX "agent_product_prices_agent_id_variant_id_key" ON "agent_product_prices"("agent_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_webhook_configs_agent_id_key" ON "agent_webhook_configs"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_slug_key" ON "product_categories"("slug");

-- CreateIndex
CREATE INDEX "product_categories_parent_id_idx" ON "product_categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_deleted_at_idx" ON "products"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE INDEX "product_variants_sku_idx" ON "product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_deleted_at_idx" ON "product_variants"("deleted_at");

-- CreateIndex
CREATE INDEX "provider_product_mappings_product_variant_id_idx" ON "provider_product_mappings"("product_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_product_mappings_provider_id_product_variant_id_key" ON "provider_product_mappings"("provider_id", "product_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "providers_code_key" ON "providers"("code");

-- CreateIndex
CREATE INDEX "providers_code_idx" ON "providers"("code");

-- CreateIndex
CREATE INDEX "providers_deleted_at_idx" ON "providers"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "provider_transactions_provider_transaction_id_key" ON "provider_transactions"("provider_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_transactions_request_id_key" ON "provider_transactions"("request_id");

-- CreateIndex
CREATE INDEX "provider_transactions_order_id_attempt_idx" ON "provider_transactions"("order_id", "attempt");

-- CreateIndex
CREATE INDEX "provider_transactions_provider_reference_idx" ON "provider_transactions"("provider_reference");

-- CreateIndex
CREATE INDEX "provider_transactions_deleted_at_idx" ON "provider_transactions"("deleted_at");

-- CreateIndex
CREATE INDEX "provider_logs_provider_id_idx" ON "provider_logs"("provider_id");

-- CreateIndex
CREATE INDEX "provider_logs_order_id_idx" ON "provider_logs"("order_id");

-- CreateIndex
CREATE INDEX "provider_logs_request_id_idx" ON "provider_logs"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_gateways_code_key" ON "payment_gateways"("code");

-- CreateIndex
CREATE UNIQUE INDEX "payments_payment_reference_key" ON "payments"("payment_reference");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payments_payment_reference_idx" ON "payments"("payment_reference");

-- CreateIndex
CREATE INDEX "payments_deleted_at_idx" ON "payments"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_transaction_id_key" ON "transactions"("transaction_id");

-- CreateIndex
CREATE INDEX "transactions_transaction_id_idx" ON "transactions"("transaction_id");

-- CreateIndex
CREATE INDEX "transactions_agent_id_idx" ON "transactions"("agent_id");

-- CreateIndex
CREATE INDEX "transactions_deleted_at_idx" ON "transactions"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_code_key" ON "orders"("order_code");

-- CreateIndex
CREATE UNIQUE INDEX "orders_payment_id_key" ON "orders"("payment_id");

-- CreateIndex
CREATE INDEX "orders_order_code_idx" ON "orders"("order_code");

-- CreateIndex
CREATE INDEX "orders_payment_status_idx" ON "orders"("payment_status");

-- CreateIndex
CREATE INDEX "orders_fulfillment_status_idx" ON "orders"("fulfillment_status");

-- CreateIndex
CREATE INDEX "orders_guest_email_idx" ON "orders"("guest_email");

-- CreateIndex
CREATE INDEX "orders_payment_expires_at_idx" ON "orders"("payment_expires_at");

-- CreateIndex
CREATE INDEX "orders_deleted_at_idx" ON "orders"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_agent_id_agent_request_id_key" ON "orders"("agent_id", "agent_request_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");

-- CreateIndex
CREATE INDEX "card_records_order_item_id_idx" ON "card_records"("order_item_id");

-- CreateIndex
CREATE INDEX "topup_transactions_order_id_idx" ON "topup_transactions"("order_id");

-- CreateIndex
CREATE INDEX "topup_transactions_order_item_id_idx" ON "topup_transactions"("order_item_id");

-- CreateIndex
CREATE INDEX "topup_transactions_provider_reference_idx" ON "topup_transactions"("provider_reference");

-- CreateIndex
CREATE INDEX "ledger_entries_agent_id_created_at_idx" ON "ledger_entries"("agent_id", "created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_reference_type_reference_id_idx" ON "ledger_entries"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "ledger_entries_deleted_at_idx" ON "ledger_entries"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_order_id_idx" ON "invoices"("order_id");

-- CreateIndex
CREATE INDEX "invoices_agent_id_idx" ON "invoices"("agent_id");

-- CreateIndex
CREATE INDEX "invoices_deleted_at_idx" ON "invoices"("deleted_at");

-- CreateIndex
CREATE INDEX "reconcile_reports_domain_report_date_idx" ON "reconcile_reports"("domain", "report_date");

-- CreateIndex
CREATE INDEX "reconcile_items_report_id_idx" ON "reconcile_items"("report_id");

-- CreateIndex
CREATE INDEX "reconcile_items_reference_idx" ON "reconcile_items"("reference");

-- CreateIndex
CREATE INDEX "webhook_logs_payment_reference_idx" ON "webhook_logs"("payment_reference");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE INDEX "notifications_recipient_type_recipient_id_idx" ON "notifications"("recipient_type", "recipient_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_role_idx" ON "notifications"("recipient_role");

-- CreateIndex
CREATE INDEX "audit_logs_admin_id_idx" ON "audit_logs"("admin_id");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "cms_pages_slug_key" ON "cms_pages"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "cms_seo_page_id_key" ON "cms_seo"("page_id");

-- CreateIndex
CREATE INDEX "cms_banners_position_status_idx" ON "cms_banners"("position", "status");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_kyc" ADD CONSTRAINT "agent_kyc_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_kyc" ADD CONSTRAINT "agent_kyc_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_product_prices" ADD CONSTRAINT "agent_product_prices_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_product_prices" ADD CONSTRAINT "agent_product_prices_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_webhook_configs" ADD CONSTRAINT "agent_webhook_configs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_product_mappings" ADD CONSTRAINT "provider_product_mappings_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_product_mappings" ADD CONSTRAINT "provider_product_mappings_product_variant_id_fkey" FOREIGN KEY ("product_variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_transactions" ADD CONSTRAINT "provider_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_transactions" ADD CONSTRAINT "provider_transactions_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_logs" ADD CONSTRAINT "provider_logs_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_logs" ADD CONSTRAINT "provider_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_records" ADD CONSTRAINT "card_records_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topup_transactions" ADD CONSTRAINT "topup_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topup_transactions" ADD CONSTRAINT "topup_transactions_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconcile_items" ADD CONSTRAINT "reconcile_items_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reconcile_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cms_pages" ADD CONSTRAINT "cms_pages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cms_seo" ADD CONSTRAINT "cms_seo_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "cms_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
