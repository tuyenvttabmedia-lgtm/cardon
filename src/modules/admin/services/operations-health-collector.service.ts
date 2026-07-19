import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderOperationalStatus, ProviderStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { HealthService } from '../../health/health.service';
import { CMS_SEO_SETTING_KEYS } from '../../cms/entities/cms.constants';
import { ProviderBalanceRepository } from '../../provider/repositories/provider-balance.repository';
import { ProviderHealthMonitorService } from '../../provider/services/provider-health-monitor.service';
import { ProviderRepository } from '../../provider/repositories/provider.repository';
import { SettingsRepository } from '../../settings/repositories/settings.repository';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import { PrismaService } from '../../../database/prisma.service';
import type {
  ChecklistStatus,
  CronOpsStatus,
  OperationsDashboard,
  PaymentGatewayStatus,
  ProductionChecklistItem,
  ProviderOpsStatus,
  QueueOpsStatus,
  SeoOpsStatus,
  SmtpOpsStatus,
  StorageOpsStatus,
  TelegramOpsStatus,
} from '../entities/operations-health.types';
import { productionReadinessLabel } from '../entities/operations-health.types';
import type { IntegrityReport } from '../../product/entities/integrity.types';
import {
  COMING_SOON_PAYMENT_GATEWAYS,
} from '../../settings/entities/payment-gateway.strategy';
import { priorityOrderLabel } from '../../settings/entities/payment-gateway-priority';
import { SystemVersionService } from './system-version.service';

@Injectable()
export class OperationsHealthCollectorService {
  private cronMeta: CronOpsStatus = {
    running: true,
    lastRunAt: null,
    nextRunAt: null,
    schedule: 'Daily 03:00',
  };

  private lastTelegramAlertAt: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly settingsStore: SettingsStoreService,
    private readonly settingsRepository: SettingsRepository,
    private readonly healthService: HealthService,
    private readonly providerRepository: ProviderRepository,
    private readonly balanceRepository: ProviderBalanceRepository,
    private readonly providerHealthMonitor: ProviderHealthMonitorService,
    @InjectQueue('provider_queue') private readonly providerQueue: Queue,
    @InjectQueue('payment_queue') private readonly paymentQueue: Queue,
    @InjectQueue('notification_queue') private readonly notificationQueue: Queue,
    @InjectQueue('email_queue') private readonly emailQueue: Queue,
    private readonly systemVersion: SystemVersionService,
  ) {}

  setCronMeta(meta: Partial<CronOpsStatus>) {
    this.cronMeta = { ...this.cronMeta, ...meta };
  }

  recordTelegramAlert() {
    this.lastTelegramAlertAt = new Date().toISOString();
  }

  async collect(report: IntegrityReport): Promise<OperationsDashboard> {
    const [
      payment,
      providers,
      queue,
      storage,
      smtp,
      seo,
      telegram,
      infra,
      systemVersion,
    ] = await Promise.all([
      this.collectPayment(),
      this.collectProviders(),
      this.collectQueue(),
      this.collectStorage(),
      this.collectSmtp(),
      this.collectSeo(),
      this.collectTelegram(),
      this.healthService.check(),
      this.systemVersion.collect(),
    ]);

    const checklist = this.buildChecklist({
      report,
      infra,
      payment,
      providers,
      queue,
      storage,
      smtp,
      seo,
      telegram,
    });

    const productionLabel = productionReadinessLabel(report.healthScore, report.summary.error);

    return {
      productionLabel,
      healthScore: report.healthScore,
      overallStatus: report.status,
      payment,
      providers,
      queue,
      storage,
      smtp,
      seo,
      cron: this.cronMeta,
      telegram,
      checklist,
      buildVersion:
        this.configService.get<string>('app.buildVersion') ??
        process.env.BUILD_VERSION ??
        '6O31.6 HOTFIX',
      environment: this.configService.get<string>('app.env') ?? process.env.NODE_ENV ?? 'production',
      systemVersion,
    };
  }

  private async collectPayment(): Promise<PaymentGatewayStatus[]> {
    const megapay = this.settingsStore.getMegapayAdminView() as {
      enabled?: boolean;
      configured?: boolean;
      environment?: string;
      secretKey?: string;
    };
    const sepay = this.settingsStore.getSepayAdminView() as {
      enabled?: boolean;
      configured?: boolean;
      environment?: string;
      apiKey?: string;
    };
    const ordered = this.settingsStore.resolveOrderedPaymentGateways();
    const now = new Date().toISOString();

    const activeGateways: PaymentGatewayStatus[] = ordered.map((gateway) => {
      const view = gateway.code === 'MEGAPAY' ? megapay : sepay;
      const enabled = Boolean(gateway.enabled && view.enabled);
      const configured = Boolean(view.configured);
      const secretsProtected = Boolean(
        (gateway.code === 'MEGAPAY' ? megapay.secretKey : sepay.apiKey)?.includes('*') || configured,
      );
      const apiOk = configured && enabled;
      const healthy = apiOk && secretsProtected;

      const checks: string[] = [];
      if (enabled) checks.push('Enabled');
      checks.push(`Priority ${gateway.priority}`);
      if (healthy) checks.push('Healthy');
      else if (apiOk) checks.push('API OK');

      return {
        id: gateway.code.toLowerCase(),
        label: gateway.label,
        role: 'active',
        priority: gateway.priority,
        priorityLabel: priorityOrderLabel(gateway.priority),
        enabled,
        configured,
        secretsProtected,
        apiOk,
        healthy,
        lastCheckAt: now,
        environment: view.environment,
        comingSoon: false,
        checks,
      };
    });

    const comingSoon: PaymentGatewayStatus[] = COMING_SOON_PAYMENT_GATEWAYS.map((gateway) => ({
      id: gateway.id,
      label: gateway.label,
      role: 'coming_soon',
      comingSoon: true,
    }));

    return [...activeGateways, ...comingSoon];
  }

  private async collectProviders(): Promise<ProviderOpsStatus[]> {
    const providers = await this.providerRepository.listAllProviders();
    const metrics = await this.providerHealthMonitor.listAllMetrics();
    const metricByProvider = new Map(metrics.map((m) => [m.providerId, m]));

    return Promise.all(
      providers.map(async (provider) => {
        const balanceRow = await this.balanceRepository.findByProviderId(provider.id);
        const metric = metricByProvider.get(provider.id);
        const healthStatus =
          provider.status !== ProviderStatus.ACTIVE
            ? provider.status
            : metric?.operationalStatus ?? ProviderOperationalStatus.ONLINE;

        return {
          id: provider.id,
          code: provider.code,
          name: provider.name,
          status: provider.status,
          healthStatus,
          balance: (balanceRow?.balance ?? provider.balance)?.toString() ?? null,
          lastSyncAt:
            balanceRow?.lastSyncAt?.toISOString() ??
            provider.lastBalanceSyncedAt?.toISOString() ??
            null,
          apiLatencyMs: metric?.avgLatencyMs ?? null,
        };
      }),
    );
  }

  private async collectQueue(): Promise<QueueOpsStatus> {
    const queueInstances = [
      { name: 'provider_queue', queue: this.providerQueue },
      { name: 'payment_queue', queue: this.paymentQueue },
      { name: 'notification_queue', queue: this.notificationQueue },
      { name: 'email_queue', queue: this.emailQueue },
    ];

    const queues: QueueOpsStatus['queues'] = [];
    let waiting = 0;
    let processing = 0;
    let completed = 0;
    let failed = 0;
    let redisStatus: QueueOpsStatus['redisStatus'] = 'unknown';

    try {
      await this.providerQueue.client;
      redisStatus = 'ok';

      for (const { name, queue } of queueInstances) {
        const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed');
        queues.push({
          name,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
        });
        waiting += counts.waiting ?? 0;
        processing += counts.active ?? 0;
        completed += counts.completed ?? 0;
        failed += counts.failed ?? 0;
      }
    } catch {
      redisStatus = 'error';
    }

    return { waiting, processing, completed, failed, redisStatus, queues };
  }

  private async collectStorage(): Promise<StorageOpsStatus> {
    const wasabiBucket = this.configService.get<string>('storage.wasabi.bucket');
    const wasabiRegion = this.configService.get<string>('storage.wasabi.region');
    const provider = wasabiBucket ? 'wasabi' as const : 'local' as const;

    if (provider === 'wasabi') {
      return {
        provider,
        bucket: wasabiBucket ?? null,
        region: wasabiRegion ?? null,
        latencyMs: null,
        objectCount: null,
        freeSpaceBytes: null,
        status: wasabiBucket && wasabiRegion ? 'pass' : 'warning',
      };
    }

    const uploadsPath = join(process.cwd(), 'uploads');
    let objectCount: number | null = null;
    let freeSpaceBytes: number | null = null;
    let status: ChecklistStatus = 'warning';

    if (existsSync(uploadsPath)) {
      status = 'pass';
      try {
        objectCount = this.countFiles(uploadsPath);
      } catch {
        objectCount = null;
      }
    }

    return {
      provider: 'local',
      bucket: 'uploads',
      region: 'local',
      latencyMs: null,
      objectCount,
      freeSpaceBytes,
      status,
    };
  }

  private async collectSmtp(): Promise<SmtpOpsStatus> {
    const smtp = this.settingsStore.getSmtpAdminView() as {
      enabled?: boolean;
      configured?: boolean;
      host?: string;
      secure?: boolean;
    };

    const lastEmail = await this.prisma.notification.findFirst({
      where: { type: { contains: 'email', mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    let queueDepth = 0;
    try {
      const counts = await this.emailQueue.getJobCounts('waiting', 'delayed');
      queueDepth = (counts.waiting ?? 0) + (counts.delayed ?? 0);
    } catch {
      queueDepth = 0;
    }

    const connected = Boolean(smtp.configured && smtp.enabled);
    return {
      connected,
      tls: Boolean(smtp.secure),
      host: smtp.host ?? null,
      lastSendAt: lastEmail?.createdAt.toISOString() ?? null,
      queueDepth,
      status: connected ? 'pass' : smtp.configured ? 'warning' : 'error',
    };
  }

  private async collectSeo(): Promise<SeoOpsStatus> {
    const seoRows = await this.prisma.systemSetting.findMany({
      where: { key: { in: Object.values(CMS_SEO_SETTING_KEYS) } },
    });
    const map = Object.fromEntries(seoRows.map((r) => [r.key, r.value]));

    const robotsTxtRaw = map[CMS_SEO_SETTING_KEYS.ROBOTS_TXT];
    const robotsTxt = typeof robotsTxtRaw === 'string' ? robotsTxtRaw : '';
    const sitemapEnabled = map[CMS_SEO_SETTING_KEYS.SITEMAP_ENABLED] !== false;
    const robotsConfigured = robotsTxt.trim().length > 0 || sitemapEnabled;

    const [missingMeta, missingOg, canonicalIssues] = await Promise.all([
      this.prisma.cmsPage.count({
        where: {
          status: 'PUBLISHED',
          OR: [{ seo: null }, { seo: { metaTitle: '' } }],
        },
      }),
      this.prisma.cmsPage.count({
        where: {
          status: 'PUBLISHED',
          OR: [{ seo: null }, { seo: { ogTitle: '' } }],
        },
      }),
      this.prisma.cmsPage.count({
        where: {
          status: 'PUBLISHED',
          seo: { canonicalUrl: '' },
        },
      }),
    ]);

    const hasIssues = missingMeta + missingOg + canonicalIssues > 0;
    return {
      robotsConfigured,
      sitemapEnabled: Boolean(sitemapEnabled),
      canonicalIssues,
      brokenLinks: 0,
      missingMeta,
      missingOg,
      notFoundPages: 0,
      status: hasIssues ? 'warning' : 'pass',
    };
  }

  private async collectTelegram(): Promise<TelegramOpsStatus> {
    const telegram = this.settingsStore.getTelegramAdminView() as {
      enabled?: boolean;
      chatId?: string;
      botToken?: string;
    };

    let connected = false;
    if (telegram.enabled && telegram.botToken && telegram.chatId) {
      try {
        const token = telegram.botToken.includes('*')
          ? this.configService.get<string>('telegram.botToken')
          : telegram.botToken;
        if (token) {
          const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
            signal: AbortSignal.timeout(5000),
          });
          connected = res.ok;
        }
      } catch {
        connected = false;
      }
    }

    return {
      enabled: Boolean(telegram.enabled),
      connected,
      chatId: telegram.chatId ?? null,
      lastMessageAt: this.lastTelegramAlertAt,
    };
  }

  private buildChecklist(input: {
    report: IntegrityReport;
    infra: Awaited<ReturnType<HealthService['check']>>;
    payment: PaymentGatewayStatus[];
    providers: ProviderOpsStatus[];
    queue: QueueOpsStatus;
    storage: StorageOpsStatus;
    smtp: SmtpOpsStatus;
    seo: SeoOpsStatus;
    telegram: TelegramOpsStatus;
  }): ProductionChecklistItem[] {
    const systemPublicUrl = this.settingsStore.resolveSystemConfig().publicUrl?.trim() ?? '';
    const envPublicUrl = this.configService.get<string>('appPublicUrl')?.trim() ?? '';
    const publicUrl = systemPublicUrl || envPublicUrl;
    const sslPass =
      publicUrl.startsWith('https://') ||
      publicUrl.includes('localhost') ||
      (this.configService.get<string>('app.env') === 'production' &&
        Boolean(envPublicUrl.startsWith('https://')));
    const anyPayment = input.payment.some(
      (g) => !g.comingSoon && g.enabled && g.configured,
    );
    const anyProvider = input.providers.some((p) => p.status === 'ACTIVE');

    return [
      { id: 'ssl', label: 'SSL', status: sslPass ? 'pass' : 'warning', detail: publicUrl || 'No public URL' },
      { id: 'database', label: 'Database', status: input.infra.database === 'ok' ? 'pass' : 'error' },
      { id: 'redis', label: 'Redis', status: input.infra.redis === 'ok' ? 'pass' : 'error' },
      { id: 'queue', label: 'Queue', status: input.queue.redisStatus === 'ok' && input.infra.workers !== 'error' ? 'pass' : 'warning' },
      { id: 'smtp', label: 'SMTP', status: input.smtp.status },
      { id: 'storage', label: 'Storage', status: input.storage.status },
      { id: 'payment', label: 'Payment', status: anyPayment ? 'pass' : 'warning' },
      { id: 'provider', label: 'Provider', status: anyProvider ? 'pass' : 'error' },
      { id: 'telegram', label: 'Telegram', status: input.telegram.enabled ? (input.telegram.connected ? 'pass' : 'warning') : 'warning' },
      { id: 'cron', label: 'Cron', status: this.cronMeta.running ? 'pass' : 'warning' },
      { id: 'scheduler', label: 'Scheduler', status: input.queue.redisStatus === 'ok' ? 'pass' : 'error' },
      { id: 'backup', label: 'Backup', status: this.backupChecklistStatus(), detail: 'DB backup cron or backup files' },
      { id: 'robots', label: 'Robots', status: input.seo.robotsConfigured ? 'pass' : 'warning' },
      { id: 'sitemap', label: 'Sitemap', status: input.seo.sitemapEnabled ? 'pass' : 'warning' },
      { id: 'environment', label: 'Environment', status: 'pass', detail: process.env.NODE_ENV ?? 'production' },
      { id: 'build', label: 'Build Version', status: 'pass', detail: this.configService.get('app.buildVersion') ?? '6O31.6 HOTFIX' },
      { id: 'integrity', label: 'Product Integrity', status: input.report.summary.error > 0 ? 'error' : input.report.summary.warning > 0 ? 'warning' : 'pass', detail: `${input.report.healthScore}%` },
      {
        id: 'maintenance',
        label: 'Maintenance',
        status: this.maintenanceChecklistStatus(),
        detail: this.settingsStore.resolveMaintenanceConfig().mode ?? 'OFF',
      },
    ];
  }

  private maintenanceChecklistStatus(): ChecklistStatus {
    const mode = this.settingsStore.resolveMaintenanceConfig().mode ?? 'OFF';
    if (mode === 'OFF') return 'pass';
    if (mode === 'READ_ONLY') return 'warning';
    return 'error';
  }

  private backupChecklistStatus(): ChecklistStatus {
    if (this.configService.get<boolean>('backup.enabled')) {
      return 'pass';
    }
    const backupDir = this.configService.get<string>('backup.dir') ?? 'backups';
    const candidates = [
      join(process.cwd(), backupDir),
      join(process.cwd(), '..', backupDir),
      '/opt/cardon/backups',
      '/app/backups',
    ];
    for (const dir of candidates) {
      if (!existsSync(dir)) continue;
      try {
        const hasBackup = readdirSync(dir).some((name) => name.endsWith('.sql.gz'));
        if (hasBackup) return 'pass';
      } catch {
        /* ignore */
      }
    }
    return 'warning';
  }

  private countFiles(dir: string): number {
    let count = 0;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) count += this.countFiles(join(dir, entry.name));
      else count += 1;
    }
    return count;
  }
}
