import { vi } from '@/lib/i18n/vi';

export const CONFIGURATION_SECTIONS = [
  { href: '/configuration', label: vi.configuration.overview, title: vi.configuration.overviewTitle, subtitle: vi.configuration.overviewSubtitle, exact: true as const },
  { href: '/configuration/system', label: vi.configuration.system, title: vi.configuration.systemTitle, subtitle: vi.configuration.systemSubtitle },
  { href: '/configuration/health', label: vi.configuration.health, title: vi.configuration.healthTitle, subtitle: vi.configuration.healthSubtitle },
  { href: '/configuration/backup', label: vi.configuration.backup, title: vi.configuration.backupTitle, subtitle: vi.configuration.backupSubtitle },
  { href: '/configuration/maintenance', label: vi.configuration.maintenance, title: vi.configuration.maintenanceTitle, subtitle: vi.configuration.maintenanceHint },
  { href: '/configuration/payment', label: vi.configuration.payment, title: vi.settings.paymentTitle, subtitle: vi.configuration.paymentSubtitle },
  { href: '/configuration/providers', label: vi.configuration.providers, title: vi.settings.providerTitle, subtitle: vi.configuration.providersSubtitle },
  { href: '/configuration/orders', label: vi.configuration.orders, title: vi.settings.orderTitle, subtitle: vi.configuration.ordersSubtitle },
  { href: '/configuration/smtp', label: vi.configuration.smtp, title: vi.settings.smtpTitle, subtitle: vi.configuration.smtpSubtitle },
  { href: '/configuration/telegram', label: vi.configuration.telegram, title: vi.configuration.telegramTitle, subtitle: vi.configuration.telegramSubtitle },
  { href: '/configuration/webhooks', label: vi.configuration.webhooks, title: vi.configuration.webhooksTitle, subtitle: vi.configuration.webhooksSubtitle },
  { href: '/configuration/audit', label: vi.configuration.audit, title: vi.systemAudit.title, subtitle: vi.systemAudit.subtitle, permission: 'audit.read' },
] as const;

export function configurationSectionFromPath(pathname: string) {
  if (pathname === '/configuration') return CONFIGURATION_SECTIONS[0];
  return CONFIGURATION_SECTIONS.find(
    (s) => !('exact' in s) && (pathname === s.href || pathname.startsWith(`${s.href}/`)),
  );
}
