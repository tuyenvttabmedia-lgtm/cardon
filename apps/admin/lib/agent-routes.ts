import { vi } from '@/lib/i18n/vi';

export const AGENT_SECTIONS = [
  { href: '/agents/overview', label: vi.agentCenter.navOverview, exact: true as const },
  { href: '/agents/list', label: vi.agentCenter.navList },
  { href: '/agents/kyc', label: vi.agentCenter.navOnboarding },
  { href: '/agents/registration/invite', label: vi.agentCenter.navRegistrationInvite },
  { href: '/agents/margin-config', label: vi.agentCenter.navMarginConfig, permission: 'pricing.manage' },
] as const;

export const AGENT_DETAIL_TABS = [
  { id: 'overview', label: vi.agentCenter.tabOverview },
  { id: 'information', label: vi.agentCenter.tabInformation },
  { id: 'wallet', label: vi.agentCenter.tabWallet, permission: 'ledger.view' },
  { id: 'api', label: vi.agentCenter.tabApi },
  { id: 'webhook', label: vi.agentCenter.tabWebhook },
  { id: 'members', label: vi.agentCenter.tabMembers },
  { id: 'roles', label: vi.agentCenter.tabRoles },
  { id: 'orders', label: vi.agentCenter.tabOrders, permission: 'orders.read' },
  { id: 'activity', label: vi.agentCenter.tabActivity, permission: 'activity.read' },
  { id: 'login-history', label: vi.agentCenter.tabLoginHistory },
  { id: 'pricing', label: vi.agentCenter.tabPricing, permission: 'pricing.manage' },
  { id: 'statement', label: vi.agentCenter.tabStatement, permission: 'finance.view' },
  { id: 'invoices', label: vi.agentCenter.tabInvoices, permission: 'finance.view' },
] as const;

export type AgentDetailTabId = (typeof AGENT_DETAIL_TABS)[number]['id'];
