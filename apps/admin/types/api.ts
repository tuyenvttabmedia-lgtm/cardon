export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  error: { code: string; message: string };
}

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  emailVerified: boolean;
  permissions?: string[];
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface DashboardStats {
  todayRevenue: string;
  ordersCount: number;
  successfulPayments: number;
  failedPayments: number;
  pendingFulfillment: number;
  providerErrors: number;
  agentStatistics: {
    total: number;
    active: number;
    pendingKyc: number;
    suspended: number;
    rejected: number;
  };
  currency: 'VND';
  asOf: string;
}

export type IntegritySeverity = 'ok' | 'warning' | 'error';

export type ChecklistStatus = 'pass' | 'warning' | 'error';

export interface SystemVersionInfo {
  build: string;
  database: { migrationCount: number };
  services: {
    api: { version: string; status: 'ok' | 'mismatch' | 'unknown' };
    web: { version: string; status: 'ok' | 'mismatch' | 'unknown' };
    admin: { version: string; status: 'ok' | 'mismatch' | 'unknown' };
    worker: { version: string; status: 'ok' | 'mismatch' | 'unknown' };
  };
  versionMismatch: boolean;
  gitCommit: string | null;
  deployTime: string | null;
}

export interface SystemHealthSummary {
  healthScore: number;
  productionLabel?: string;
  status: IntegritySeverity;
  runAt: string | null;
  lastScanAt?: string | null;
  scanning?: boolean;
  summary: { ok: number; warning: number; error: number };
  categoryIntegrity?: {
    status: IntegritySeverity;
    label: 'Healthy' | 'Needs Repair';
  };
  systemVersion?: SystemVersionInfo;
  versionMismatch?: boolean;
  maintenance?: {
    mode: string;
    active: boolean;
    readOnly: boolean;
    maintenance: boolean;
    emergency: boolean;
  };
}

export interface OperationsDashboard {
  productionLabel: string;
  healthScore: number;
  overallStatus: IntegritySeverity;
  payment: Array<{
    id: string;
    label: string;
    role?: string;
    priority?: number;
    priorityLabel?: string;
    enabled?: boolean;
    configured?: boolean;
    secretsProtected?: boolean;
    apiOk?: boolean;
    healthy?: boolean;
    lastCheckAt?: string | null;
    comingSoon?: boolean;
    environment?: string;
    checks?: string[];
  }>;
  providers: Array<{ id: string; code: string; name: string; status: string; healthStatus: string; balance: string | null; lastSyncAt: string | null; apiLatencyMs: number | null }>;
  queue: { waiting: number; processing: number; completed: number; failed: number; redisStatus: string; queues: Array<{ name: string; waiting: number; active: number; completed: number; failed: number }> };
  storage: { provider: string; bucket: string | null; region: string | null; latencyMs: number | null; objectCount: number | null; freeSpaceBytes: number | null; status: ChecklistStatus };
  smtp: { connected: boolean; tls: boolean; host: string | null; lastSendAt: string | null; queueDepth: number; status: ChecklistStatus };
  seo: { robotsConfigured: boolean; sitemapEnabled: boolean; canonicalIssues: number; brokenLinks: number; missingMeta: number; missingOg: number; notFoundPages: number; status: ChecklistStatus };
  cron: { running: boolean; lastRunAt: string | null; nextRunAt: string | null; schedule: string };
  telegram: { connected: boolean; chatId: string | null; lastMessageAt: string | null; enabled: boolean };
  checklist: Array<{ id: string; label: string; status: ChecklistStatus; detail?: string }>;
  buildVersion: string;
  environment: string;
  systemVersion?: SystemVersionInfo;
}

export interface HealthScanState {
  running: boolean;
  startedAt: string | null;
  completedAt: string | null;
  reportReady: boolean;
}

export interface IntegrityFinding {
  id: string;
  domain: string;
  severity: IntegritySeverity;
  entityType: string;
  entityId?: string;
  entityLabel: string;
  message: string;
  autoFixable: boolean;
  fixAction?: string;
}

export interface IntegrityDomainSummary {
  domain: string;
  label: string;
  status: IntegritySeverity;
  okCount: number;
  warningCount: number;
  errorCount: number;
}

export interface IntegrityReport {
  runAt: string | null;
  durationMs?: number;
  healthScore: number;
  productionLabel?: string;
  status: IntegritySeverity;
  summary: { ok: number; warning: number; error: number };
  domains: IntegrityDomainSummary[];
  findings: IntegrityFinding[];
  operations?: OperationsDashboard;
  scanState?: { running: boolean; startedAt: string | null; completedAt: string | null };
}

export interface AutoFixResponse {
  report: IntegrityReport;
  fixResult: { applied: number; skipped: number; actions: Array<{ findingId: string; action: string; success: boolean; message?: string }> };
}

export interface OrderItem {
  id: string;
  variantId: string;
  quantity: number;
  unitPrice: string;
  discount: string;
  totalAmount: string;
  status: string;
  variant?: { sku: string; name: string };
}

export interface Order {
  id: string;
  orderCode: string;
  channel: string;
  isGuestOrder: boolean;
  guestEmail: string | null;
  guestPhone: string | null;
  totalAmount: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  paymentExpiresAt: string | null;
  createdAt: string;
  items: OrderItem[];
}

export interface AdminOrderListItem {
  id: string;
  orderCode: string;
  customerEmail: string | null;
  customerPhone: string | null;
  productType: string;
  customerPaid: string;
  providerCost: string;
  gatewayFee: string;
  profit: string;
  paymentMethod: string | null;
  paymentStatus: string;
  fulfillmentStatus: string;
  createdAt: string;
  totalAmount: string;
}

export interface AdminOrderSummary {
  totalRevenue: string;
  providerCost: string;
  gatewayFee: string;
  profit: string;
  orderCount: number;
  deliveredCount: number;
  successRate: number;
}

export interface FulfillmentResult {
  orderId: string;
  fulfillmentStatus: string;
  providerTransactionId?: string;
  cardsDelivered?: number;
}

export interface ManualReviewPayment {
  id: string;
  paymentReference: string;
  gateway: string;
  amount: string;
  status: string;
  updatedAt: string;
  order: {
    id: string;
    orderCode: string;
    paymentStatus: string;
    totalAmount: string;
    guestEmail: string | null;
  };
  gatewayResponse?: unknown;
}

export interface WebhookLog {
  id: string;
  source: string;
  paymentReference: string | null;
  processed: boolean;
  createdAt: string;
}

export interface ManualReviewResponse {
  payments: ManualReviewPayment[];
  unknownWebhooks: WebhookLog[];
}

export interface AdminPayment {
  id: string;
  orderId: string;
  gateway: string;
  methodCode: string | null;
  paymentReference: string;
  amount: string;
  status: string;
  gatewayTransactionId: string | null;
  bankTransactionId: string | null;
  bankReference: string | null;
  settlementDate: string | null;
  reconciliationStatus: 'PENDING' | 'MATCHED' | 'DIFFERENCE' | 'MANUAL_REVIEW';
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

export interface ProviderTransaction {
  id: string;
  orderId: string;
  providerId: string;
  requestId: string;
  attempt: number;
  action: string;
  status: string;
  providerTransactionId: string | null;
  providerReference: string | null;
  createdAt: string;
  updatedAt: string;
  requestPayload: unknown;
  responsePayload: unknown;
}

export interface ProviderBalanceCheck {
  balance: string;
  lastCheckedAt: string;
  lowBalance: boolean;
}

export interface ProviderProductSync {
  synced: number;
  newCount?: number;
  updatedCount?: number;
  disabledCount?: number;
  message?: string;
}

export type HomeServiceType = 'GAME_CARD' | 'PHONE_CARD' | 'TOPUP' | 'DATA';

export interface Category {
  id: string;
  slug: string;
  name: string;
  iconUrl?: string | null;
  parentId: string | null;
  sortOrder: number;
  status: string;
  homeService?: HomeServiceType | null;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  name: string;
  type: string;
  faceValue: string;
  sellPrice: string;
  status: string;
  metadata?: Record<string, unknown>;
  providerMappings?: ProviderMapping[];
}

export interface Product {
  id: string;
  categoryId: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  status: string;
  homeService?: HomeServiceType | null;
  category?: {
    id: string;
    slug: string;
    name: string;
    homeService?: HomeServiceType | null;
  };
  variants?: ProductVariant[];
}

export interface ProviderMapping {
  id: string;
  providerId: string;
  productVariantId: string;
  providerProductCode: string;
  providerCost: string;
  priority: number;
  status: string;
  availability?: string;
  provider?: { id: string; code: string; name: string };
}

export interface AdminAgent {
  id: string;
  userId: string;
  companyName: string;
  balance: string;
  heldBalance: string;
  hasApiCredentials: boolean;
  lastUsedAt: string | null;
  contactEmail: string | null;
  rateLimit: number;
  apiEnabled: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  kyc?: { status: string; companyName?: string; taxCode?: string } | null;
  user?: { id: string; email: string; role?: string };
}

export interface ProviderStatus {
  id: string;
  code: string;
  name: string;
  status: string;
  healthStatus?: 'ONLINE' | 'OFFLINE' | 'ERROR' | 'SLOW';
  balance: string;
  balanceStatus?: string;
  lastCheckedAt: string | null;
  lowBalanceWarning: boolean;
  threshold: number;
  todaySuccess?: number;
  todayFailed?: number;
  successRate?: number | null;
  avgLatencyMs?: number | null;
  errorRate?: number | null;
  lastError?: { message: string | null; at: string } | null;
  recentFailures: Array<{
    id: string;
    action: string;
    status: string;
    errorMessage: string | null;
    createdAt: string;
    orderId: string | null;
  }>;
}

export interface ProviderDetail {
  id: string;
  code: string;
  name: string;
  status: string;
  balance: string;
  lastCheckedAt: string | null;
  successRate: number | null;
  avgLatencyMs: number | null;
  lastError: string | null;
  runtimeSetting: ProviderRuntimeSettings;
}

export interface ProviderRuntimeSettings {
  maintenanceMode: boolean;
  reason: string | null;
  startAt: string | null;
  endAt: string | null;
}

export interface ProviderConnectionTest {
  success: boolean;
  balance?: string;
  currency?: string;
  responseTimeMs: number;
  message?: string;
  errorCode?: string;
}

export interface ProviderReconciliationReport {
  id: string;
  providerId: string;
  reportDate: string;
  openingBalance: string;
  closingBalance: string | null;
  totalTransactions: number;
  successTransactions: number;
  failedTransactions: number;
  totalProviderCost: string;
  expectedBalance: string;
  actualBalance: string | null;
  differenceAmount: string;
  status: 'MATCHED' | 'DIFFERENCE' | 'NEED_CHECK';
  provider?: { id: string; code: string; name: string };
}

export interface ProviderTransactionSearchItem {
  id: string;
  orderId: string;
  orderCode: string;
  providerId: string;
  providerCode: string;
  providerName: string;
  providerTransactionId: string | null;
  requestId: string;
  status: string;
  type: string | null;
  faceValue: string | null;
  providerCost: string | null;
  customerPaid: string;
  gatewayFee: string;
  profit: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  responsePayload: unknown;
  createdAt: string;
  completedAt: string | null;
}

export interface ProviderFinanceDashboard {
  dateFrom: string;
  dateTo: string;
  today: {
    revenue: string;
    providerCost: string;
    gatewayFee: string;
    grossProfit: string;
    orderCount: number;
  };
  byProvider: Array<{
    providerId: string;
    code: string;
    name: string;
    orders: number;
    success: number;
    successRate: number | null;
    totalCost: string;
    profitGenerated: string;
  }>;
}

export interface AuditLog {
  id: string;
  adminId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
  admin?: { id: string; email: string; role: string };
}

export interface SystemAuditLog {
  id: string;
  resource: string;
  resourceId: string | null;
  resourceName: string | null;
  action: string;
  fieldName: string | null;
  oldValue: unknown;
  newValue: unknown;
  performedBy: string;
  performedEmail: string;
  performedRole: string;
  ipAddress: string | null;
  userAgent: string | null;
  sessionId: string | null;
  correlationId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface SystemAuditLogStats {
  today: number;
  yesterday: number;
  thisMonth: number;
  total: number;
}

export interface SystemAuditLogListResponse {
  items: SystemAuditLog[];
  total: number;
  page: number;
  limit: number;
  stats: SystemAuditLogStats;
}

export interface SystemActivityLog {
  id: string;
  eventType: string;
  eventCategory: string;
  severity: string;
  source: string;
  resource: string | null;
  resourceId: string | null;
  resourceDisplay: string | null;
  title: string;
  description: string | null;
  performedBy: string | null;
  performedEmail: string | null;
  performedRole: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  sessionId: string | null;
  correlationId: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface SystemActivityLogStats {
  today: number;
  yesterday: number;
  thisWeek: number;
  total: number;
}

export interface SystemActivityLogListResponse {
  items: SystemActivityLog[];
  total: number;
  page: number;
  limit: number;
  stats: SystemActivityLogStats;
}

export interface SystemNotification {
  id: string;
  title: string;
  message: string;
  notificationType: string;
  severity: string;
  source: string;
  resource: string | null;
  resourceId: string | null;
  resourceDisplay: string | null;
  recipientType: string;
  recipientId: string | null;
  recipientRole: string | null;
  isRead: boolean;
  readAt: string | null;
  channel: string;
  metadata: unknown;
  createdAt: string;
  resourceHref: string | null;
}

export interface SystemNotificationStats {
  unread: number;
  today: number;
  critical: number;
  resolved: number;
}

export interface SystemNotificationListResponse {
  items: SystemNotification[];
  total: number;
  page: number;
  limit: number;
  stats: SystemNotificationStats;
}

export interface QueueMonitorDashboardSummary {
  totalQueues: number;
  activeJobs: number;
  waitingJobs: number;
  delayedJobs: number;
  completedToday: number;
  failedJobs: number;
  retryingJobs: number;
  pausedQueues: number;
  criticalQueues: number;
  warningQueues: number;
  redisStatus: 'ok' | 'error' | 'unknown';
  workerConnected: boolean;
  throughput: QueueMonitorThroughput;
}

export interface QueueMonitorThroughput {
  jobsPerSec: number;
  jobsPerMinute: number;
  jobsPerHour: number;
  avgProcessingTimeMs: number | null;
  avgWaitingTimeMs: number | null;
  retryRate: number;
  failureRate: number;
}

export type QueueHealthStatus = 'HEALTHY' | 'WARNING' | 'CRITICAL';

export interface QueueMonitorQueueRow {
  name: string;
  displayName: string;
  status: 'running' | 'paused' | 'unknown';
  health: QueueHealthStatus;
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: number;
  workerCount: number;
  workerOnline: boolean;
  redisStatus: 'ok' | 'error' | 'unknown';
  failureRatePct: number;
  lastActivityAt: string | null;
  avgProcessingTimeMs: number | null;
  retryCount: number;
}

export interface QueueMonitorDashboard {
  summary: QueueMonitorDashboardSummary;
  queues: QueueMonitorQueueRow[];
}

export interface QueueMonitorJob {
  id: string;
  queue: string;
  displayName: string;
  name: string;
  status: string;
  priority: number;
  attempts: number;
  progress: number;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  correlationId: string | null;
  requestId: string | null;
}

export interface QueueMonitorJobDetail extends QueueMonitorJob {
  payload: unknown;
  result: unknown;
  error: string | null;
  stackTrace: string[];
  maxAttempts: number | null;
  logs: string[];
  timeline: Array<{
    step: string;
    label: string;
    at: string | null;
    durationMs: number | null;
  }>;
  orderId: string | null;
  paymentId: string | null;
  customerEmail: string | null;
  providerTransaction: string | null;
}

export interface QueueMonitorStatistics {
  queue: string;
  displayName: string;
  counts: Record<string, number>;
  completedToday: number;
  failedToday: number;
  avgProcessingTimeMs: number | null;
  p95ProcessingTimeMs: number | null;
  avgWaitingTimeMs: number | null;
  jobsPerMinute: number;
  jobsPerHour: number;
  jobsPerSec: number;
  successRate: number;
  failureRate: number;
  retryRate: number;
  retries: number;
  longestJob: { id: string; ms: number } | null;
  oldestWaiting: { id: string; createdAt: string | null; waitingMs: number | null } | null;
  hourly: Array<{
    hour: string;
    completed: number;
    failed: number;
    waiting: number;
    active: number;
    retry: number;
  }>;
}

export interface QueueMonitorHistory {
  queue: string;
  displayName: string;
  range: string;
  from: string;
  to: string;
  buckets: Array<{
    label: string;
    completed: number;
    failed: number;
    retry: number;
    waiting: number;
  }>;
}

export interface QueueMonitorWorkerInfo {
  queue: string;
  displayName: string;
  configuredWorkerCount: number;
  workers: Array<{
    name: string;
    status: string;
    pid: string | null;
    hostname: string | null;
    startedAt: string | null;
    uptimeMs: number | null;
    memoryUsageMb: number | null;
    cpuUsagePct: number | null;
    lastHeartbeatAt: string | null;
    lastHeartbeatAgeMs: number | null;
  }>;
  globalHeartbeat: {
    connected: boolean;
    at: string | null;
    ageMs: number | null;
  };
}

export interface QueueMonitorConfig {
  queue: string;
  displayName: string;
  readonly: boolean;
  attempts: number;
  backoff: Record<string, unknown>;
  concurrency: number;
  limiter: Record<string, unknown> | null;
  defaultJobOptions: Record<string, unknown>;
  rateLimit: string | null;
  workerCount: number;
}

export type WebhookMonitorStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'PENDING'
  | 'RETRY'
  | 'TIMEOUT'
  | 'INVALID_SIGNATURE'
  | 'DUPLICATE'
  | 'IGNORED';

export interface WebhookMonitorSummary {
  totalToday: number;
  success: number;
  failed: number;
  pending: number;
  duplicate: number;
  invalidSignature: number;
  retryQueue: number;
  avgResponseTimeMs: number | null;
  last24Hours: number;
}

export interface WebhookMonitorSourceRow {
  source: string;
  displayName: string;
  health: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  today: number;
  success: number;
  failed: number;
  retry: number;
  avgResponseTimeMs: number | null;
  lastReceivedAt: string | null;
}

export interface WebhookMonitorItem {
  id: string;
  createdAt: string;
  source: string;
  displayName: string;
  endpoint: string;
  method: string;
  status: WebhookMonitorStatus;
  httpCode: number;
  durationMs: number | null;
  signatureValid: boolean;
  retry: number;
  correlationId: string | null;
  requestId: string | null;
  orderId: string | null;
  paymentId: string | null;
  paymentReference: string;
  provider: string;
  ipAddress: string | null;
  cancelled: boolean;
}

export interface WebhookMonitorListResponse {
  summary: WebhookMonitorSummary;
  sources: WebhookMonitorSourceRow[];
  items: WebhookMonitorItem[];
  total: number;
  page: number;
  limit: number;
}

export interface WebhookMonitorDetail extends WebhookMonitorItem {
  payload: unknown;
  payloadCollapsed: boolean;
  payloadSizeBytes: number;
  headers: Record<string, string>;
  response: {
    httpCode: number;
    body: unknown;
    durationMs: number | null;
    worker: string | null;
    queue: string | null;
  };
  timeline: Array<{
    step: string;
    label: string;
    at: string | null;
    durationMs: number | null;
  }>;
  retryHistory: Array<{
    attempt: number;
    time: string;
    httpCode: number;
    durationMs: number | null;
    worker: string | null;
    webhookId: string;
  }>;
  metadata: Record<string, unknown>;
  signature: {
    verified: boolean;
    invalid: boolean;
    badge: string;
  };
}

export interface WebhookMonitorStatistics {
  total: number;
  success: number;
  failed: number;
  pending: number;
  duplicate: number;
  invalidSignature: number;
  timeout: number;
  retry: number;
  webhooksPerMinute: number;
  webhooksPerHour: number;
  avgDurationMs: number | null;
  retryRate: number;
  failureRate: number;
  duplicateRate: number;
  signatureFailRate: number;
  hourly: Array<{
    hour: string;
    success: number;
    failed: number;
    retry: number;
    timeout: number;
    duplicate: number;
  }>;
}

export interface WebhookMonitorHistory {
  range: string;
  from: string;
  to: string;
  buckets: Array<{
    label: string;
    success: number;
    failed: number;
    retry: number;
    timeout: number;
    duplicate: number;
  }>;
}

export type ConfigurationModuleId =
  | 'payment'
  | 'providers'
  | 'orders'
  | 'smtp'
  | 'telegram'
  | 'webhooks'
  | 'security'
  | 'integrations'
  | 'feature-flags'
  | 'maintenance'
  | 'backup'
  | 'system'
  | 'audit'
  | 'advanced'
  | 'health';

export const EXPORTABLE_MODULES = [
  'payment',
  'smtp',
  'telegram',
  'providers',
  'feature-flags',
  'system',
  'orders',
] as const;

export interface ConfigurationSearchEntry {
  id: string;
  module: string;
  label: string;
  keywords: string[];
  href: string;
}

export interface ConfigurationOverview {
  summary: {
    configuredModules: number;
    totalModules: number;
    warnings: number;
    secretsProtected: boolean;
    environment: string;
    databaseSettings: number;
    pendingChanges: number;
    lastModifiedAt: string | null;
    lastModifiedBy: string | null;
    lastBackupAt: string | null;
    productionReady: boolean;
  };
  modules: Array<{ id: string; label: string; status: string; href: string }>;
  warnings: Array<{ id: string; message: string; severity: string }>;
  dependencies: Array<{ id: string; message: string; severity: string }>;
}

export interface ConfigurationAuditMeta {
  module: string;
  lastModifiedAt: string | null;
  modifiedBy: string | null;
  modifiedByRole?: string | null;
  source: string | null;
  secretsProtected?: boolean;
  developerOverride?: boolean;
}

export type MaintenanceMode = 'OFF' | 'READ_ONLY' | 'MAINTENANCE' | 'EMERGENCY';

export interface MaintenanceBannerConfig {
  title?: string;
  description?: string;
  icon?: string;
  color?: string;
  buttonText?: string;
  buttonLink?: string;
  startAt?: string | null;
  endAt?: string | null;
}

export interface MaintenanceScheduleConfig {
  startAt?: string | null;
  endAt?: string | null;
  timezone?: string;
  autoEnable?: boolean;
  autoDisable?: boolean;
}

export interface MaintenancePartnerConfig {
  allowDuringMaintenance?: boolean;
  whitelistAgentIds?: string[];
}

export interface MaintenanceCustomerPageConfig {
  supportLink?: string;
  telegram?: string;
  facebook?: string;
  hotline?: string;
  estimatedFinish?: string | null;
}

export interface MaintenanceHistoryEntry {
  id: string;
  action: string;
  mode: MaintenanceMode;
  reason?: string;
  performedBy: string;
  performedEmail?: string;
  at: string;
}

export interface MaintenanceConfig {
  mode?: MaintenanceMode;
  reason?: string;
  modules?: Record<string, boolean>;
  banner?: MaintenanceBannerConfig;
  schedule?: MaintenanceScheduleConfig;
  partner?: MaintenancePartnerConfig;
  customerPage?: MaintenanceCustomerPageConfig;
  history?: MaintenanceHistoryEntry[];
  lastChangedAt?: string;
  lastChangedBy?: string;
  lastChangedEmail?: string;
}

export interface MaintenanceDashboard {
  config: MaintenanceConfig;
  summary: {
    status: MaintenanceMode;
    readOnly: boolean;
    affectedModules: string[];
    currentBanner: MaintenanceBannerConfig;
    scheduledTasks: MaintenanceScheduleConfig[];
    historyCount: number;
    active: boolean;
  };
  publicStatus: Record<string, unknown>;
}

export interface ProfitReport {
  dateFrom: string;
  dateTo: string;
  orderCount: number;
  revenue: string;
  providerCost: string;
  grossProfit: string;
  currency: 'VND';
  filters: Record<string, unknown>;
}

export interface ReconcileReport {
  id: string;
  domain: string;
  gateway?: string;
  providerCode?: string;
  reportDate: string;
  summary: { total: number; matched: number; mismatch: number };
  createdAt: string;
  items?: ReconcileItem[];
}

export interface ReconcileItem {
  reference: string;
  matchStatus: string;
  statusLabel: string;
  localAmount: string | null;
  externalAmount: string | null;
  details?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  type: string;
  status: string;
  amount: string;
  createdAt: string;
  issuedAt: string | null;
}

export interface AgentStatement {
  agentId: string;
  companyName: string;
  period: { from: string; to: string };
  openingBalance: string;
  closingBalance: string;
  summary: { credits: string; debits: string; holds: string; releases: string };
  entries: Array<{ type: string; amount: string; description: string; createdAt: string }>;
  currency: 'VND';
}

export interface KycApproveResult {
  agentId: string;
  status: string;
  apiKey: string;
  secretKey: string;
  message: string;
}

export interface CmsSeo {
  metaTitle: string;
  metaDescription: string;
  metaKeywords?: string | null;
  focusKeyword?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImage?: string | null;
  canonicalUrl?: string | null;
  robots?: string;
}

export interface CmsCategory {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  intro?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  ogImageUrl?: string | null;
  sortOrder: number;
}

export interface CmsTag {
  id: string;
  slug: string;
  name: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  isHidden?: boolean;
  usageCount?: number;
}

export interface CmsMedia {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  alt?: string | null;
  title?: string | null;
  storage: string;
  storageKey?: string | null;
  folder: string;
  width?: number | null;
  height?: number | null;
  thumbnailUrl?: string | null;
  createdAt: string;
}

export interface CmsThemeSettings {
  logoDesktop: string;
  logoMobile: string;
  favicon: string;
  ogDefaultImage: string;
  headerMenu: Array<{ label: string; href: string; sortOrder?: number }>;
  footerColumns: Array<{ title: string; links: Array<{ label: string; href: string }> }>;
  companyInfo?: {
    companyName?: string;
    taxCode?: string;
    address?: string;
    hotline?: string;
    email?: string;
  };
  contactChannels?: Array<{
    key: 'email' | 'hotline' | 'zalo' | 'fanpage' | 'address';
    enabled?: boolean;
    value?: string;
    href?: string;
  }>;
  mobileNav?: Array<{
    label: string;
    icon: string;
    url: string;
    sortOrder?: number;
    requireLogin?: boolean;
    active?: boolean;
  }>;
}

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: 'NEW' | 'PROCESSED';
  createdAt: string;
  updatedAt: string;
}

export type SupportTicketStatus = 'OPEN' | 'PROCESSING' | 'RESOLVED';
export type SupportTicketPriority = 'LOW' | 'NORMAL' | 'HIGH';

export interface SupportTicketMessage {
  id: string;
  authorType: 'CUSTOMER' | 'STAFF';
  authorId?: string | null;
  body: string;
  attachmentUrl?: string | null;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  ticketCode: string;
  subject: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  createdAt: string;
  updatedAt?: string;
  customer?: { id: string; email: string; fullName: string | null; phone?: string | null };
  order?: {
    id?: string;
    orderCode: string;
    paymentStatus?: string;
    fulfillmentStatus?: string;
    totalAmount?: string;
  } | null;
  messages?: SupportTicketMessage[];
}

export interface CmsFaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
  status?: 'ACTIVE' | 'INACTIVE';
}

/** @deprecated use FaqItem */
export type LegacyCmsFaqItem = CmsFaqItem;

export interface FaqCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  status: 'ACTIVE' | 'INACTIVE';
  faqCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FaqItem {
  id: string;
  categoryId: string;
  question: string;
  answer: string;
  slug: string;
  featured: boolean;
  sortOrder: number;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  viewCount: number;
  category: {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    icon?: string | null;
    sortOrder: number;
  };
  positions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FaqListResponse {
  items: FaqItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CmsPage {
  id: string;
  type: 'PAGE' | 'BLOG_POST' | 'PRODUCT_LANDING';
  slug: string;
  title: string;
  content: string;
  excerpt?: string | null;
  category?: string | null;
  categoryId?: string | null;
  categoryRel?: CmsCategory | null;
  pageTags?: Array<{ tag: CmsTag }>;
  tags?: string[];
  featuredImage?: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  pageLayout?: 'ARTICLE' | 'LANDING' | 'POLICY';
  showInNav?: boolean;
  navSortOrder?: number;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  author?: { id: string; email: string } | null;
  seo?: CmsSeo | null;
}

export interface CmsBanner {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl?: string | null;
  position: string;
  sortOrder: number;
  status: string;
  startAt?: string | null;
  endAt?: string | null;
}

export interface CmsSeoSettings {
  siteTitle: string;
  metaDescription: string;
  googleAnalyticsId: string;
  googleTagManagerId: string;
  searchConsoleVerification: string;
  robotsTxt: string;
  sitemapEnabled: boolean;
  sitemapBaseUrl: string;
  ogImageUrl: string;
}

export interface SettingsSourceView {
  configured: boolean;
  source: 'database' | 'environment';
  enabled?: boolean;
  environment?: 'sandbox' | 'production';
}

export interface PaymentGatewaySettings extends SettingsSourceView {
  merchantId?: string;
  endpoint?: string;
  returnUrl?: string;
  callbackUrl?: string;
  webhookUrl?: string;
  secretKey?: string;
  webhookSecret?: string;
  apiKey?: string;
  bankAccount?: string;
  bankCode?: string;
  accountName?: string;
  qrTemplate?: string;
  integrationMode?: 'legacy_qr' | 'payment_gateway';
}

export interface PaymentRuntimeSettings extends SettingsSourceView {
  defaultGateway?: 'MEGAPAY' | 'SEPAY' | 'PAYOS' | 'VNPAY' | 'MOMO' | 'ZALOPAY' | 'NOWPAYMENTS';
}

export interface PaymentGatewayRuntimeSettings extends SettingsSourceView {
  code?: 'MEGAPAY' | 'SEPAY';
  enabled?: boolean;
  priority?: number;
  displayName?: string;
  percentageFee?: number;
  fixedFee?: number;
}

export interface PaymentStrategyGatewayView {
  code: 'MEGAPAY' | 'SEPAY';
  label: string;
  priority: number;
  enabled: boolean;
  displayName?: string;
  runtime: PaymentGatewayRuntimeSettings;
}

export interface PaymentStrategySettings extends SettingsSourceView {
  defaultGateway?: 'MEGAPAY' | 'SEPAY';
  gateways?: PaymentStrategyGatewayView[];
  selectionOrder?: Array<'MEGAPAY' | 'SEPAY'>;
}

export interface UpdatePaymentStrategyBody {
  defaultGateway?: 'MEGAPAY' | 'SEPAY';
  gateways?: Array<{
    code: 'MEGAPAY' | 'SEPAY';
    priority: number;
    enabled?: boolean;
  }>;
}

export interface PaymentMethodConfig {
  gatewayCode: 'SEPAY' | 'MEGAPAY';
  methodCode: string;
  displayName: string;
  description?: string;
  iconUrl?: string | null;
  logoUrl?: string | null;
  settlementType: 'DIRECT_TO_MERCHANT' | 'GATEWAY_SETTLEMENT';
  enabled: boolean;
  percentageFee: number;
  fixedFee: number;
}

export interface PaymentSettlementReport {
  dateFrom: string;
  dateTo: string;
  gateway: string | null;
  settlementType: string | null;
  sections: Array<
    | {
        settlementType: string;
        gateway: string;
        transactionCount: number;
        totalVolume: string;
        gatewayFee: string;
        bankReceivedAmount: string;
        gatewayFeeInvoice: string;
      }
    | {
        settlementType: string;
        gateway: string;
        transactionCount: number;
        totalVolume: string;
        gatewayFee: string;
        gatewayCollected: string;
        expectedSettlement: string;
        actualSettlement: string | null;
        settlementGap: string | null;
      }
  >;
}

export interface GatewayInvoiceRecord {
  id: string;
  gatewayCode: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  totalTransactions: number;
  totalVolume: string;
  totalFee: string;
  vatAmount: string;
  invoiceNumber: string | null;
  status: 'PENDING' | 'MATCHED' | 'DIFFERENCE';
  systemTransactions: number | null;
  systemVolume: string | null;
  systemFee: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GatewayFeesReport {
  dateFrom: string;
  dateTo: string;
  gateway: string | null;
  rows: Array<{
    gateway: string;
    methodCode: string;
    methodDisplayName: string;
    method: string;
    transactionCount: number;
    totalCollected: string;
    percentFee: string;
    fixedFee: string;
    totalFee: string;
    netAmount: string;
  }>;
  groups: Array<{
    gateway: string;
    methods: GatewayFeesReport['rows'];
  }>;
}

export interface ProviderEsaleSettings extends SettingsSourceView {
  cardApiUrl?: string;
  topupApiUrl?: string;
  agencyCode?: string;
  clientCode?: string;
  secretKey?: string;
  privateKey?: string;
  publicKey?: string;
  timeoutMs?: number;
}

export interface SmtpSettings extends SettingsSourceView {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  from?: string;
  fromName?: string;
  secure?: boolean;
}

export interface SystemSettings extends SettingsSourceView {
  siteName?: string;
  publicUrl?: string;
  providerLowBalanceThreshold?: number;
  agentLowBalanceThreshold?: number;
  agentRegistrationMode?: 'INVITE_ONLY' | 'PUBLIC_APPROVAL' | 'DISABLED';
  customerTopupEnabled?: boolean;
  customerDataEnabled?: boolean;
}

export interface OrderSettings extends SettingsSourceView {
  guestMaxOrderAmount?: number;
  customerMaxOrderAmount?: number;
}

export interface TelegramSettings extends SettingsSourceView {
  enabled?: boolean;
  chatId?: string;
  botToken?: string;
}

export interface ProviderAlertSettings {
  lowBalanceThreshold: number;
  alertAdminEnabled: boolean;
  alertTelegramEnabled: boolean;
  alertEmailEnabled: boolean;
}

export interface GlobalSearchResult {
  query: string;
  orders: Array<{ id: string; orderCode: string; paymentStatus: string; fulfillmentStatus: string }>;
  customers: Array<{ id: string; email: string; username: string | null; role: string; status: string }>;
  staff: Array<{ id: string; email: string; username: string | null; role: string; status: string }>;
  payments: Array<{ id: string; paymentReference: string; gateway: string; orderId: string; status: string }>;
  providerTransactions: Array<{ id: string; orderId: string; requestId: string; providerTransactionId: string | null; status: string }>;
  finance: Array<unknown>;
}

export interface AdminDeliveryItem {
  id: string;
  cardId?: string;
  productName: string;
  faceValue: string;
  quantity?: number;
  serial: string | null;
  pin: string | null;
  pinMasked: string | null;
  expiredAt: string | null;
  providerName: string | null;
  providerTransactionId: string | null;
  deliveredAt: string | null;
  phoneNumber?: string | null;
  telco?: string | null;
  packageName?: string | null;
  status?: string;
}

export interface AdminOrderDelivery {
  type: 'CARD' | 'TOPUP' | 'DATA';
  productName: string | null;
  faceValue: string | null;
  quantity: number | null;
  items: AdminDeliveryItem[];
}

export interface AdminOrderDetail {
  overview: {
    orderCode: string;
    customer: Record<string, string | null>;
    createdAt: string;
    products: Array<{
      sku: string;
      name: string;
      type: string;
      quantity: number;
      faceValue: string;
      sellPrice: string;
      unitPrice: string;
      totalAmount: string;
      deliveryStatus: string;
    }>;
    totalAmount: string;
    paymentStatus: string;
    fulfillmentStatus: string;
    pricing: {
      faceValue: string;
      sellAmount: string;
      discountAmount: string;
      gatewayFee?: string;
      paymentMethodCode: string | null;
      methodDisplayName: string | null;
      settlementType: string | null;
      paymentGateway: string | null;
      gatewayCode: string | null;
      methodCode: string | null;
      paymentFeeAmount: string;
      customerPaid: string;
      providerCost: string;
      profit: string;
    };
  };
  delivery: AdminOrderDelivery;
  paymentTrace: Array<Record<string, unknown>>;
  providerTrace: Array<Record<string, unknown>>;
  cardDelivery: {
    cardCount: number;
    emailDeliveryStatus: string;
    cards: Array<{
      id: string;
      productName: string;
      faceValue: string;
      serial: string;
      pinMasked: string;
      hasPin: boolean;
      pinViewed: boolean;
      status: string;
    }>;
  };
  pinRevealHistory: Array<{
    id: string;
    cardId: string;
    viewedBy: string;
    viewedByEmail: string;
    viewedAt: string;
  }>;
  topupDelivery: {
    items: Array<{
      id: string;
      phoneNumber: string;
      telco: string;
      amount: string;
      status: string;
      providerReference: string | null;
      resultMessage: string | null;
      createdAt: string;
    }>;
  };
  auditTimeline: Array<Record<string, unknown>>;
  fulfillmentTimeline?: Array<{
    id: string;
    eventType: string;
    message: string;
    metadata: unknown;
    createdAt: string;
  }>;
  order: Order;
}

export interface AdminCustomer {
  id: string;
  username: string | null;
  fullName: string | null;
  email: string;
  phone: string | null;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminCustomerDetail {
  profile: AdminCustomer & { emailVerifiedAt: string | null; acceptedTermsAt: string | null };
  orders: Array<{ id: string; orderCode: string; totalAmount: unknown; paymentStatus: string; fulfillmentStatus: string; createdAt: string }>;
  ordersTotal: number;
  orderSkip: number;
  orderTake: number;
  totalSpending: string;
}

export interface AdminStaff {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}
