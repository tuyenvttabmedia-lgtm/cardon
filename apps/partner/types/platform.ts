export type AgentPlatformRole = 'OWNER' | 'MANAGER' | 'FINANCE' | 'OPERATOR' | 'DEVELOPER' | 'READONLY';

export type AgentPlatformPermission =
  | 'dashboard.read'
  | 'wallet.read'
  | 'wallet.export'
  | 'finance.read'
  | 'finance.export'
  | 'orders.read'
  | 'orders.export'
  | 'products.read'
  | 'settlement.read'
  | 'reports.read'
  | 'api.read'
  | 'api.manage'
  | 'webhooks.read'
  | 'webhooks.manage'
  | 'invoices.read'
  | 'users.read'
  | 'users.manage'
  | 'support.read'
  | 'settings.read'
  | 'settings.manage'
  | 'notifications.read'
  | 'organization.read'
  | 'organization.manage'
  | 'sessions.read'
  | 'sessions.manage'
  | 'retry.manage';

export interface AgentPlatformSession {
  userId: string;
  agentId?: string;
  memberId?: string | null;
  platformRole: AgentPlatformRole;
  permissions: AgentPlatformPermission[];
  isPrimaryOwner?: boolean;
  impersonation?: { sessionId: string; readOnly: boolean } | null;
}

export interface AgentPlatformDashboard {
  walletBalance: string;
  frozenBalance: string;
  availableBalance: string;
  todayOrders: number;
  revenueToday: string;
  profitToday: string;
  pendingSettlement: string;
  pendingDeposit: string;
  apiCallsToday: number;
  successRate: number;
  lastWebhookAt: string | null;
  unreadNotifications: number;
  currency: 'VND';
}

export interface AgentWalletOverview {
  currentBalance: string;
  frozenBalance: string;
  availableBalance: string;
  creditLimit: string;
  pendingDeposit: string;
  pendingWithdraw: string;
  currency: 'VND';
}

export interface AgentWalletOverviewExtended extends AgentWalletOverview {
  currentBalance: string;
  pendingSettlement: string;
  todaySpending: string;
  monthSpending: string;
  todayCommission: string;
  discountTier: string;
  lastUpdated: string;
  balanceTrend7: Array<{ date: string; balance: string }>;
  balanceTrend30: Array<{ date: string; balance: string }>;
  unreadNotifications: number;
}

export interface WalletLedgerEntry {
  id: string;
  time: string;
  referenceNo: string;
  orderId: string | null;
  type: string;
  description: string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  operator: string | null;
  status: string;
}

export interface WalletLedgerFilters {
  dateFrom?: string;
  dateTo?: string;
  type?: string;
  status?: string;
  orderId?: string;
  reference?: string;
  amountMin?: string;
  amountMax?: string;
  search?: string;
  skip?: number;
  take?: number;
}

export interface WalletLedgerPage {
  items: WalletLedgerEntry[];
  total: number;
  skip: number;
  take: number;
}

export interface WalletDepositRow {
  id: string;
  time: string;
  reference: string;
  amount: string;
  gateway: string;
  status: string;
  approvedBy: string | null;
  completedAt: string;
  description: string | null;
}

export interface WalletLimits {
  creditLimit: string;
  dailyPurchaseLimit: string;
  monthlyPurchaseLimit: string;
  currentUtilization: string;
  remainingLimit: string;
  status: string;
  readOnly: boolean;
}

export interface AgentFinanceOverview {
  availableBalance: string;
  pendingSettlement: string;
  creditLimit: string;
  creditUsed: string;
  creditRemaining: string;
  pendingDeposit: string;
  pendingWithdraw: string;
  revenueToday: string;
  discountToday: string;
  monthProfit: string;
  monthRevenue: string;
  monthOrders: number;
  cashFlowTrend7: Array<{ date: string; balance: string }>;
  cashFlowTrend30: Array<{ date: string; balance: string }>;
  unreadNotifications: number;
  currency: 'VND';
}

export interface FinanceDepositRow {
  id: string;
  time: string;
  reference: string;
  amount: string;
  feeAmount?: string;
  netAmount?: string;
  gateway: string;
  status: string;
  statusLabel?: string;
  statusTone?: string;
  approvedBy: string | null;
  completedAt: string | null;
  description: string | null;
}

export interface FinanceDepositDetail {
  id: string;
  paymentReference: string;
  gateway: string;
  amount: string;
  feeAmount: string;
  netAmount: string;
  status: string;
  statusLabel: string;
  statusTone: string;
  paymentUrl?: string;
  qrInfo?: {
    qrUrl?: string;
    bankInfo?: { bankCode?: string; accountNumber?: string; accountName?: string };
    amount?: string | number;
  };
  transferContent?: string;
  expiresAt: string | null;
  paidAt: string | null;
  creditedAt: string | null;
  createdAt: string;
  timeline: Array<{ status: string; label: string; at: string | null; reached: boolean }>;
}

export interface FinanceDepositGateway {
  code: string;
  label: string;
  priority: number;
}

export interface FinanceWithdrawRow {
  id: string;
  time: string;
  reference: string;
  amount: string;
  account: string;
  status: string;
}

export interface FinanceSettlementRow {
  id: string;
  cycle: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  paymentStatus: string;
  orderCount: number;
  revenue: string;
  discount: string;
  profit: string;
  netRevenue: string;
  paidAt: string | null;
  invoiceNumber: string | null;
  invoiceId: string | null;
  lockedAt: string | null;
}

export interface FinanceSettlementDetail extends FinanceSettlementRow {
  summary: Record<string, unknown>;
  invoiceStatus: string | null;
  invoiceAmount: string | null;
  adjustments: Array<{ id: string; amount: string; reason: string; createdAt: string }>;
  timeline: Array<{ at: string; label: string; detail?: string }>;
  readOnly: boolean;
}

export interface FinanceAdjustmentRow {
  id: string;
  time: string;
  reference: string;
  type: string;
  amount: string;
  description: string;
  operator: string | null;
  status: string;
}

export interface FinanceCreditInfo {
  creditLimit: string;
  dailyPurchaseLimit: string;
  monthlyPurchaseLimit: string;
  currentUtilization: string;
  remainingLimit: string;
  status: string;
  readOnly: boolean;
  issuedAt: string | null;
  expiresAt: string | null;
  approvedBy: string | null;
  creditUsed: string;
  creditRemaining: string;
}

export interface FinanceHistoryEntry extends WalletLedgerEntry {
  category: string;
}

export interface FinanceHistoryPage {
  items: FinanceHistoryEntry[];
  total: number;
  skip: number;
  take: number;
}

export interface FinanceHistoryFilters {
  dateFrom?: string;
  dateTo?: string;
  type?: string;
  category?: string;
  search?: string;
  skip?: number;
  take?: number;
}

export interface WalletRecentActivity {
  ledgerEntries: WalletLedgerEntry[];
  recentOrders: Array<{
    id: string;
    orderCode: string | null;
    amount: string;
    status: string;
    createdAt: string;
  }>;
  notifications: unknown[];
  pendingItems: { deposits: number; withdraws: number; settlement: number };
}

export interface AgentPlatformOrder {
  id: string;
  request_id: string;
  product_code: string;
  product_name: string;
  amount: string;
  status: 'SUCCESS' | 'PROCESSING' | 'FAILED';
  fulfillment_status: string;
  created_at: string;
}

export interface AgentOrderListRow {
  id: string;
  requestId: string;
  orderId: string;
  transactionId: string;
  partnerOrderId: string;
  customerReference: string | null;
  providerTransaction: string | null;
  gateway: string;
  product: string;
  productName: string;
  faceValue: string;
  sellPrice: string;
  costPrice: string;
  profit: string;
  status: 'SUCCESS' | 'PROCESSING' | 'FAILED' | 'REFUND';
  fulfillmentStatus: string;
  createdAt: string;
  completedAt: string | null;
  latencyMs: number | null;
  provider: string | null;
  retryCount: number;
  sourceIp: string | null;
  apiKey: string | null;
}

export interface AgentOrderListPage {
  items: AgentOrderListRow[];
  total: number;
  skip: number;
  take: number;
}

export interface AgentOrderStatistics {
  cards: {
    totalToday: number;
    successToday: number;
    failedToday: number;
    processingToday: number;
    refundToday: number;
    successRate: number;
    avgLatencyMs: number;
    esaleLatencyMs: number;
    gatewayInUse: string;
    walletBalance: string;
  };
  charts: {
    hourly: Array<{ hour: string; total: number; success: number; failed: number }>;
    daily: Array<{ date: string; total: number; success: number; failed: number }>;
    byProduct: Array<{ sku: string; name: string; count: number }>;
  };
  reports: AgentOrderReports;
  currency: 'VND';
}

export interface AgentOrderReports {
  successRate: number;
  failureRate: number;
  timeoutRate: number;
  avgLatencyMs: number;
  gatewayUsage: Record<string, number>;
  providerUsage: Record<string, number>;
  topProducts: Array<{ sku: string; name: string; count: number }>;
  topErrors: Array<{ code: string; count: number }>;
  hourlyDistribution: Array<{ hour: number; count: number }>;
}

export interface AgentOrderDetail extends AgentOrderListRow {
  apiRequest: unknown;
  apiResponse: unknown;
  providerRequest: unknown;
  providerResponse: unknown;
  webhook: AgentOrderWebhookEntry | null;
  walletHold: { transactionId: string; status: string } | null;
  ledgerCommit: { status: string; at: string };
  notification: { sent: boolean };
  activityLog: Array<{ id: string; type: string; message: string; at: string; metadata: unknown }>;
  auditLink: string | null;
  clientTrace: { ipAddress: string | null; userAgent: string | null };
  timeline: Array<{ id: string; stage: string; label: string; status: string; at: string; metadata?: unknown }>;
  lifecycle: Array<{ stage: string; status: string; at: string }>;
  retryAllowed: boolean;
}

export interface AgentOrderWebhookEntry {
  id: string;
  orderId: string;
  requestId: string | null;
  received: boolean;
  verified: boolean;
  processed: boolean;
  completed: boolean;
  failed: boolean;
  retry: number;
  signature: string | null;
  payload: unknown;
  headers: unknown;
  processingTimeMs: number;
  deliveredAt: string | null;
  createdAt: string;
}

export interface AgentOrderListFilters {
  skip?: number;
  take?: number;
  status?: string;
  gateway?: string;
  provider?: string;
  product?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  amountMin?: string;
  amountMax?: string;
}

export interface AgentPlatformProduct {
  id: string;
  variantId: string;
  sku: string;
  name: string;
  category: string | null;
  agentPrice: string;
  status: string;
}

export interface AgentPlatformPricingResponse {
  readOnly: boolean;
  items: AgentPlatformProduct[];
}

export interface AgentPlatformApiCenter {
  hasCredentials: boolean;
  apiEnabled: boolean;
  apiKeyMasked: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  status: 'ACTIVE' | 'INACTIVE';
  rateLimit: number;
  ipWhitelist: string[];
  usageToday: number;
  statistics: { totalCalls: number; successRate: number };
}

export interface AgentPlatformWebhookCenter {
  configured: boolean;
  callbackUrl: string | null;
  enabled: boolean;
  events: unknown;
  updatedAt: string | null;
  retryPolicy: string;
  logs: unknown[];
}

export interface AgentPlatformMember {
  id: string;
  email: string;
  platformRole: AgentPlatformRole;
  status: string;
  lastLoginAt: string | null;
  isPrimary: boolean;
}

export interface AgentPlatformInvoice {
  id: string;
  invoiceNumber: string;
  type: string;
  status: string;
  totalAmount: string;
  issuedAt: string | null;
  createdAt: string;
}

export interface AgentIpWhitelistEntry {
  id: string;
  cidr: string;
  description: string;
  enabled: boolean;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  lastUsedAt: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
}

export interface AgentSecurityApiKeys {
  hasCredentials: boolean;
  apiEnabled: boolean;
  apiKeyMasked: string | null;
  label: string;
  environment: 'PRODUCTION' | 'SANDBOX';
  createdAt: string;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  expiresAt: string | null;
  status: string;
  permissions: string[];
}

export interface AgentSecurityDashboard {
  apiEnabled: boolean;
  hasCredentials: boolean;
  ipWhitelistCount: number;
  webhookConfigured: boolean;
  rateLimit: number;
  usage: AgentSecurityRateLimit;
  recentLogs: AgentApiLogEntry[];
  recentEvents: AgentSecurityEvent[];
}

export interface AgentSecurityRateLimit {
  plan: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  currentMinute: number;
  currentDay: number;
  remainingMinute: number;
  remainingDay: number;
  burst: number;
  history429: Array<{ at: string; count: number }>;
  resetAt: number;
}

export interface AgentApiLogEntry {
  id: string;
  at: string;
  type: string;
  ip: string | null;
  path: string | null;
  method: string | null;
  message: string;
  requestId?: string | null;
  httpStatus?: number;
  latencyMs?: number | null;
  orderId?: string | null;
  partnerOrderId?: string | null;
  errorCode?: string | null;
}

export interface AgentApiLogListPage {
  items: AgentApiLogEntry[];
  page: number;
  limit: number;
  total: number;
}

export interface AgentApiLogDetail extends AgentApiLogEntry {
  requestHeaders: Record<string, unknown>;
  requestBody: unknown;
  responseBody: unknown;
  responseHeaders: Record<string, unknown>;
  timeline: Array<{ at: string; step: string; detail?: string; httpStatus?: number }>;
}

export interface AgentApiUsageStats {
  period: string;
  total: number;
  success: number;
  failed: number;
  successRate: number;
  avgLatencyMs: number;
  topEndpoints: Array<{ key: string; count: number }>;
  topErrors: Array<{ key: string; count: number }>;
  topProducts: Array<{ key: string; count: number }>;
  gatewayUsage: Array<{ gateway: string; count: number }>;
}

export interface ApiErrorCodeDoc {
  code: string;
  meaning: string;
  cause: string;
  solution: string;
}

export interface AgentSecurityEvent {
  id: string;
  at: string;
  type: string;
  title: string;
  description: string | null;
  severity: string;
  ip: string | null;
}

export interface AgentSecurityWebhook {
  configured: boolean;
  callbackUrl: string | null;
  enabled: boolean;
  events: unknown;
  signatureAlgorithm: string;
  secretMasked: string | null;
  hasSecret: boolean;
  updatedAt: string | null;
  history: Array<{ at: string; by: string; action: string }>;
  verificationExample: {
    header: string;
    versionHeader?: string;
    eventHeader?: string;
    algorithm: string;
    payload: string;
    version?: string;
  };
}

export type WebhookDeliveryStatusLabel =
  | 'Pending'
  | 'Sending'
  | 'Delivered'
  | 'Retrying'
  | 'Failed'
  | 'DeadLetter'
  | 'Cancelled';

export interface WebhookDeliveryListItem {
  id: string;
  createdAt: string;
  orderId: string;
  partnerOrderId: string | null;
  requestId: string | null;
  destination: string;
  event: string;
  version: string;
  status: WebhookDeliveryStatusLabel;
  httpStatus: number | null;
  attempts: number;
  latencyMs: number | null;
  result: string;
  lastError: string | null;
  gateway?: string | null;
  provider?: string | null;
}

export interface WebhookDeliveryListPage {
  items: WebhookDeliveryListItem[];
  page: number;
  limit: number;
  total: number;
}

export interface WebhookDeliveryDetail extends WebhookDeliveryListItem {
  payload: unknown;
  rawPayload: unknown;
  requestUrl: string;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  signature: string | null;
  timeline: Array<{
    at: string;
    status: string;
    detail?: string;
    httpStatus?: number | null;
    attempt?: number;
  }>;
  canRetry: boolean;
  canCancel: boolean;
}

export interface WebhookDeliveryStatistics {
  period: string;
  total: number;
  delivered: number;
  failed: number;
  pending: number;
  deadLetter: number;
  retrying: number;
  successRate: number;
}

export interface AgentOrganizationOverview {
  companyName: string;
  agentCode: string;
  status: string;
  createdAt: string;
  owner: { email: string; name: string | null };
  userCount: number;
  apiKeyConfigured: boolean;
  webhookStatus: string;
  webhookUrl: string | null;
  walletBalance: string;
  kycStatus: string;
  agentId: string;
}

export interface AgentOrganizationUser {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: AgentPlatformRole;
  roleLabel: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  twoFactorEnabled: boolean;
}

export interface AgentOrganizationInvite {
  id: string;
  email: string;
  role: AgentPlatformRole;
  roleLabel: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export interface AgentOrganizationUsersPage {
  items: AgentOrganizationUser[];
  invites: AgentOrganizationInvite[];
  page: number;
  limit: number;
  total: number;
  roles: AgentPlatformRole[];
}

export interface AgentLoginHistoryEntry {
  id: string;
  at: string;
  ip: string | null;
  country: string | null;
  browser: string | null;
  device: string | null;
  result: string;
}

export interface AgentSessionEntry {
  id: string;
  createdAt: string;
  expiresAt: string;
}

export interface AgentPermissionMatrix {
  roles: Array<{ role: AgentPlatformRole; label: string; permissions: AgentPlatformPermission[] }>;
  modules: Array<{ key: string; label: string; permission: string; access: Record<string, boolean> }>;
  currentRole: AgentPlatformRole;
}
