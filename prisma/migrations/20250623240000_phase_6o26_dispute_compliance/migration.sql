-- Phase 6O26 — Dispute & Compliance Center

CREATE TYPE "CardAccessAction" AS ENUM ('VIEW_PIN');

CREATE TABLE "card_access_logs" (
    "id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "action" "CardAccessAction" NOT NULL,
    "reason" VARCHAR(512) NOT NULL,
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_access_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "card_access_logs_card_id_idx" ON "card_access_logs"("card_id");
CREATE INDEX "card_access_logs_order_id_idx" ON "card_access_logs"("order_id");
CREATE INDEX "card_access_logs_admin_id_idx" ON "card_access_logs"("admin_id");
CREATE INDEX "card_access_logs_created_at_idx" ON "card_access_logs"("created_at");

ALTER TABLE "card_access_logs" ADD CONSTRAINT "card_access_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "card_access_logs" ADD CONSTRAINT "card_access_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
