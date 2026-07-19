import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ProviderStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { existsSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../../database/prisma.service';
import {
  WORKER_HEARTBEAT_KEY,
  WORKER_HEARTBEAT_TTL_SEC,
} from '../../../queue/worker-heartbeat.service';
import { TelegramNotificationService } from '../../notification/providers/telegram-notification.service';
import { ProviderRepository } from '../../provider/repositories/provider.repository';
import { SettingsStoreService } from '../../settings/services/settings-store.service';
import { MaintenanceAvailabilityService } from '../../maintenance-center/services/maintenance-availability.service';
import { ProductIntegrityService } from '../../product/services/product-integrity.service';
import { CategoryIntegrityService } from '../../product/services/category-integrity.service';
import type { OperationsDashboard } from '../entities/operations-health.types';
import { productionReadinessLabel } from '../entities/operations-health.types';
import type {
  AutoFixResult,
  IntegrityDomain,
  IntegrityFinding,
  IntegrityReport,
  IntegritySeverity,
} from '../entities/system-health.types';
import {
  computeHealthScore,
  DOMAIN_LABELS,
  overallStatus,
} from '../entities/system-health.types';
import { OperationsHealthCollectorService } from './operations-health-collector.service';
import { OperationsHealthPdfService } from './operations-health-pdf.service';
import { SystemVersionService } from './system-version.service';

@Injectable()
export class SystemHealthService {
  private readonly logger = new Logger(SystemHealthService.name);
  private lastReport: IntegrityReport | null = null;
  private scanState = {
    running: false,
    startedAt: null as string | null,
    completedAt: null as string | null,
  };

  constructor(
    private readonly productIntegrity: ProductIntegrityService,
    private readonly categoryIntegrity: CategoryIntegrityService,
    private readonly operationsCollector: OperationsHealthCollectorService,
    private readonly systemVersion: SystemVersionService,
    private readonly pdfService: OperationsHealthPdfService,
    private readonly prisma: PrismaService,
    private readonly providerRepository: ProviderRepository,
    private readonly settingsStore: SettingsStoreService,
    private readonly maintenanceAvailability: MaintenanceAvailabilityService,
    private readonly telegram: TelegramNotificationService,
    @InjectQueue('provider_queue') private readonly queue: Queue,
  ) {}

  async getSummary() {
    const report = this.lastReport;
    const categoryDomain = report?.domains.find((d) => d.domain === 'category_integrity');
    const systemVersion = await this.systemVersion.collect();
    this.maintenanceAvailability.applyScheduledTransitions();
    const maintenance = this.maintenanceAvailability.getPublicStatus();
    return {
      healthScore: report?.healthScore ?? 100,
      productionLabel: report?.productionLabel ?? productionReadinessLabel(100, 0),
      status: report?.status ?? ('ok' as IntegritySeverity),
      runAt: report?.runAt ?? null,
      lastScanAt: report?.runAt ?? null,
      scanning: this.scanState.running,
      summary: report?.summary ?? { ok: 0, warning: 0, error: 0 },
      maintenance,
      categoryIntegrity: {
        status: categoryDomain?.status ?? ('ok' as IntegritySeverity),
        label: categoryDomain?.status === 'ok' ? 'Healthy' : 'Needs Repair',
      },
      systemVersion,
      versionMismatch: systemVersion.versionMismatch,
    };
  }

  getScanState() {
    return { ...this.scanState, reportReady: !!this.lastReport?.runAt };
  }

  getLastReport(): IntegrityReport | null {
    return this.lastReport;
  }

  startScanAsync(notifyOnAlert = false) {
    if (this.scanState.running) {
      return { status: 'running' as const, startedAt: this.scanState.startedAt };
    }

    this.scanState = {
      running: true,
      startedAt: new Date().toISOString(),
      completedAt: null,
    };

    void this.runScan(notifyOnAlert)
      .catch((error) => {
        this.logger.warn(
          `Async health scan failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => {
        this.scanState = {
          running: false,
          startedAt: this.scanState.startedAt,
          completedAt: new Date().toISOString(),
        };
      });

    return { status: 'started' as const, startedAt: this.scanState.startedAt };
  }

  async runScan(notifyOnAlert = false): Promise<IntegrityReport> {
    const started = Date.now();
    const findings: IntegrityFinding[] = [];

    const productFindings = await this.productIntegrity.scan();
    findings.push(...productFindings);

    const categoryFindings = await this.categoryIntegrity.scan();
    findings.push(...categoryFindings);

    findings.push(...(await this.scanProviders()));
    findings.push(...(await this.scanPayment()));
    findings.push(...(await this.scanEmail()));
    findings.push(...(await this.scanQueue()));
    findings.push(...(await this.scanStorage()));
    findings.push(...(await this.scanSeo()));

    const activeProductCount = await this.prisma.product.count({
      where: { deletedAt: null, status: 'ACTIVE' },
    });
    const productIssues = findings.filter((f) => f.domain === 'product' && f.severity !== 'ok');
    const healthyProducts = Math.max(
      0,
      activeProductCount - new Set(productIssues.map((f) => f.entityId)).size,
    );

    const summary = {
      ok: healthyProducts + findings.filter((f) => f.severity === 'ok').length,
      warning: findings.filter((f) => f.severity === 'warning').length,
      error: findings.filter((f) => f.severity === 'error').length,
    };

    const report = this.buildReport(findings, Date.now() - started, summary, healthyProducts);
    const operations = await this.operationsCollector.collect(report);
    report.operations = operations;
    report.productionLabel = operations.productionLabel;
    this.lastReport = report;

    if (notifyOnAlert && this.shouldNotify(report)) {
      await this.notifyAdmins(report);
    }

    return report;
  }

  exportJson(): Buffer {
    const report = this.lastReport;
    if (!report) {
      return Buffer.from(JSON.stringify({ runAt: null, message: 'No scan yet' }, null, 2));
    }
    return Buffer.from(JSON.stringify(report, null, 2), 'utf8');
  }

  exportPdf(): Buffer {
    const report = this.lastReport;
    if (!report?.operations) {
      return this.pdfService.buildPdf(
        report ?? {
          runAt: new Date().toISOString(),
          durationMs: 0,
          healthScore: 100,
          status: 'ok',
          summary: { ok: 0, warning: 0, error: 0 },
          domains: [],
          findings: [],
        },
        {
          productionLabel: 'No scan yet',
          healthScore: 100,
          overallStatus: 'ok',
          payment: [],
          providers: [],
          queue: { waiting: 0, processing: 0, completed: 0, failed: 0, redisStatus: 'unknown', queues: [] },
          storage: { provider: 'local', bucket: null, region: null, latencyMs: null, objectCount: null, freeSpaceBytes: null, status: 'warning' },
          smtp: { connected: false, tls: false, host: null, lastSendAt: null, queueDepth: 0, status: 'warning' },
          seo: { robotsConfigured: false, sitemapEnabled: false, canonicalIssues: 0, brokenLinks: 0, missingMeta: 0, missingOg: 0, notFoundPages: 0, status: 'warning' },
          cron: { running: false, lastRunAt: null, nextRunAt: null, schedule: 'Daily 03:00' },
          telegram: { connected: false, chatId: null, lastMessageAt: null, enabled: false },
          checklist: [],
          buildVersion: '6O31.6 HOTFIX',
          environment: 'production',
        },
      );
    }
    return this.pdfService.buildPdf(report, report.operations as unknown as OperationsDashboard);
  }

  setCronSchedule(nextRunAt: string) {
    this.operationsCollector.setCronMeta({ running: true, nextRunAt, schedule: 'Daily 03:00' });
  }

  recordCronRun() {
    this.operationsCollector.setCronMeta({
      running: true,
      lastRunAt: new Date().toISOString(),
    });
  }

  async autoFix(): Promise<{ report: IntegrityReport; fixResult: AutoFixResult }> {
    const findings = this.lastReport?.findings ?? (await this.runScan()).findings;
    const fixResult = await this.productIntegrity.autoFix(findings);
    const categoryFix = await this.categoryIntegrity.autoFix(findings);
    fixResult.applied += categoryFix.applied;
    fixResult.skipped += categoryFix.skipped;
    fixResult.actions.push(...categoryFix.actions);
    const report = await this.runScan();
    return { report, fixResult };
  }

  private shouldNotify(report: IntegrityReport): boolean {
    return report.healthScore < 90 || report.summary.error > 0;
  }

  private buildReport(
    findings: IntegrityFinding[],
    durationMs: number,
    summary: { ok: number; warning: number; error: number },
    healthyProducts: number,
  ): IntegrityReport {
    const domains: IntegrityDomain[] = [
      'product',
      'category',
      'category_integrity',
      'variant',
      'provider_mapping',
      'provider',
      'payment',
      'email',
      'queue',
      'storage',
      'seo',
    ];

    const domainSummaries = domains.map((domain) => {
      const domainFindings = findings.filter((f) => f.domain === domain);
      const warningCount = domainFindings.filter((f) => f.severity === 'warning').length;
      const errorCount = domainFindings.filter((f) => f.severity === 'error').length;
      let okCount = domainFindings.filter((f) => f.severity === 'ok').length;
      if (domain === 'product' && okCount === 0 && errorCount === 0 && warningCount === 0) {
        okCount = healthyProducts;
      }
      let status: IntegritySeverity = 'ok';
      if (errorCount > 0) status = 'error';
      else if (warningCount > 0) status = 'warning';
      return {
        domain,
        label: DOMAIN_LABELS[domain],
        status,
        okCount,
        warningCount,
        errorCount,
      };
    });

    const healthScore = computeHealthScore(summary);

    return {
      runAt: new Date().toISOString(),
      durationMs,
      healthScore,
      productionLabel: productionReadinessLabel(healthScore, summary.error),
      status: overallStatus(summary),
      summary,
      domains: domainSummaries,
      findings,
      scanState: { ...this.scanState },
    };
  }

  private async scanProviders(): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];
    const providers = await this.providerRepository.listAllProviders();
    for (const provider of providers) {
      if (provider.status !== ProviderStatus.ACTIVE) {
        findings.push({
          id: `provider-${provider.id}`,
          domain: 'provider',
          severity: 'warning',
          entityType: 'Provider',
          entityId: provider.id,
          entityLabel: provider.name,
          message: `Provider ${provider.status}`,
          autoFixable: false,
        });
      }
    }
    return findings;
  }

  private async scanPayment(): Promise<IntegrityFinding[]> {
    const megapay = this.settingsStore.getMegapayAdminView() as { enabled?: boolean };
    const sepay = this.settingsStore.getSepayAdminView() as { enabled?: boolean };
    const findings: IntegrityFinding[] = [];
    if (!megapay.enabled && !sepay.enabled) {
      findings.push({
        id: 'payment-none',
        domain: 'payment',
        severity: 'warning',
        entityType: 'Payment',
        entityLabel: 'Payment Gateway',
        message: 'Không có cổng thanh toán nào được bật',
        autoFixable: false,
      });
    }
    return findings;
  }

  private async scanEmail(): Promise<IntegrityFinding[]> {
    const smtp = this.settingsStore.getSmtpAdminView() as { enabled?: boolean; host?: string };
    const findings: IntegrityFinding[] = [];
    if (!smtp.enabled || !smtp.host) {
      findings.push({
        id: 'email-smtp',
        domain: 'email',
        severity: 'warning',
        entityType: 'Email',
        entityLabel: 'SMTP',
        message: 'SMTP chưa cấu hình hoặc chưa bật',
        autoFixable: false,
      });
    }
    return findings;
  }

  private async scanQueue(): Promise<IntegrityFinding[]> {
    const findings: IntegrityFinding[] = [];
    try {
      const client = await this.queue.client;
      const heartbeat = await client.get(WORKER_HEARTBEAT_KEY);
      if (!heartbeat) {
        findings.push({
          id: 'queue-worker',
          domain: 'queue',
          severity: 'error',
          entityType: 'Queue',
          entityLabel: 'Worker',
          message: 'Worker heartbeat không phản hồi',
          autoFixable: false,
        });
      } else {
        const ageSec = (Date.now() - Number(heartbeat)) / 1000;
        if (ageSec > WORKER_HEARTBEAT_TTL_SEC) {
          findings.push({
            id: 'queue-worker-stale',
            domain: 'queue',
            severity: 'warning',
            entityType: 'Queue',
            entityLabel: 'Worker',
            message: `Worker heartbeat cũ (${Math.round(ageSec)}s)`,
            autoFixable: false,
          });
        }
      }
    } catch {
      findings.push({
        id: 'queue-redis',
        domain: 'queue',
        severity: 'error',
        entityType: 'Queue',
        entityLabel: 'Redis',
        message: 'Không kết nối được Queue/Redis',
        autoFixable: false,
      });
    }
    return findings;
  }

  private async scanStorage(): Promise<IntegrityFinding[]> {
    const uploadsPath = join(process.cwd(), 'uploads');
    if (!existsSync(uploadsPath)) {
      return [{
        id: 'storage-uploads',
        domain: 'storage',
        severity: 'warning',
        entityType: 'Storage',
        entityLabel: 'Uploads',
        message: 'Thư mục uploads không tồn tại',
        autoFixable: false,
      }];
    }
    return [];
  }

  private async scanSeo(): Promise<IntegrityFinding[]> {
    const pagesMissingMeta = await this.prisma.cmsPage.count({
      where: {
        status: 'PUBLISHED',
        OR: [{ seo: null }, { seo: { metaTitle: '' } }],
      },
    });
    if (pagesMissingMeta > 0) {
      return [{
        id: 'seo-pages',
        domain: 'seo',
        severity: 'warning',
        entityType: 'SEO',
        entityLabel: 'CMS Pages',
        message: `${pagesMissingMeta} trang published thiếu meta title`,
        autoFixable: false,
      }];
    }
    return [];
  }

  private async notifyAdmins(report: IntegrityReport) {
    try {
      const telegram = this.settingsStore.getTelegramAdminView() as {
        enabled?: boolean;
        botToken?: string;
        chatId?: string;
      };
      if (!telegram.enabled || !telegram.botToken || !telegram.chatId) return;

      const text =
        `<b>⚠️ System Health Alert</b>\n` +
        `Production: ${report.productionLabel ?? 'Unknown'}\n` +
        `Score: ${report.healthScore}%\n` +
        `Errors: ${report.summary.error}\n` +
        `Warnings: ${report.summary.warning}\n` +
        `Run at: ${report.runAt}`;

      const sent = await this.telegram.sendMessage(telegram.botToken, telegram.chatId, text);
      if (sent) {
        this.operationsCollector.recordTelegramAlert();
      }
    } catch (error) {
      this.logger.warn(`Health notification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
