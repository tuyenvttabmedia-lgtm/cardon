-- BUILD 6033.8 API Observability — persistent partner API request logs

CREATE TABLE "agent_api_request_logs" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "request_time" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "request_id" VARCHAR(128),
    "api_key_masked" VARCHAR(64),
    "source_ip" VARCHAR(64),
    "endpoint" VARCHAR(512) NOT NULL,
    "method" VARCHAR(16) NOT NULL,
    "http_status" INTEGER NOT NULL,
    "latency_ms" INTEGER,
    "gateway" VARCHAR(64) DEFAULT 'partner_api',
    "provider" VARCHAR(64),
    "order_id" UUID,
    "partner_order_id" VARCHAR(128),
    "response_code" VARCHAR(64),
    "response_message" VARCHAR(512),
    "error_code" VARCHAR(64),
    "error_message" VARCHAR(512),
    "log_type" VARCHAR(32) NOT NULL,
    "retry" BOOLEAN NOT NULL DEFAULT false,
    "user_agent" VARCHAR(512),
    "correlation_id" VARCHAR(128),
    "request_headers" JSONB NOT NULL DEFAULT '{}',
    "request_body" JSONB,
    "response_body" JSONB,
    "response_headers" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "agent_api_request_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_api_request_logs_agent_id_request_time_idx" ON "agent_api_request_logs"("agent_id", "request_time");
CREATE INDEX "agent_api_request_logs_request_id_idx" ON "agent_api_request_logs"("request_id");
CREATE INDEX "agent_api_request_logs_order_id_idx" ON "agent_api_request_logs"("order_id");
CREATE INDEX "agent_api_request_logs_partner_order_id_idx" ON "agent_api_request_logs"("partner_order_id");
CREATE INDEX "agent_api_request_logs_endpoint_idx" ON "agent_api_request_logs"("endpoint");
CREATE INDEX "agent_api_request_logs_http_status_idx" ON "agent_api_request_logs"("http_status");
CREATE INDEX "agent_api_request_logs_log_type_idx" ON "agent_api_request_logs"("log_type");
CREATE INDEX "agent_api_request_logs_source_ip_idx" ON "agent_api_request_logs"("source_ip");

ALTER TABLE "agent_api_request_logs" ADD CONSTRAINT "agent_api_request_logs_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
