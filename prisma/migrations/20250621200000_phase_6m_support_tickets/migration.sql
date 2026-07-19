CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'PROCESSING', 'RESOLVED');
CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');
CREATE TYPE "SupportMessageAuthorType" AS ENUM ('CUSTOMER', 'STAFF');

CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "ticket_code" VARCHAR(32) NOT NULL,
    "customer_id" UUID NOT NULL,
    "order_id" UUID,
    "subject" VARCHAR(255) NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_ticket_messages" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "author_type" "SupportMessageAuthorType" NOT NULL,
    "author_id" UUID,
    "body" TEXT NOT NULL,
    "attachment_url" VARCHAR(512),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "support_tickets_ticket_code_key" ON "support_tickets"("ticket_code");
CREATE INDEX "support_tickets_customer_id_idx" ON "support_tickets"("customer_id");
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");
CREATE INDEX "support_tickets_created_at_idx" ON "support_tickets"("created_at");
CREATE INDEX "support_ticket_messages_ticket_id_idx" ON "support_ticket_messages"("ticket_id");

ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
