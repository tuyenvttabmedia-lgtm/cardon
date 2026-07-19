import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
  SystemAuditAction,
  SystemAuditResource,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import { AuditLogService } from '../../audit-log/services/audit-log.service';
import { AgentRepository } from '../../agent/repositories/agent.repository';
import { AgentCredentialService } from '../../agent/services/agent-credential.service';
import { AGENT_API_KEY_PREFIX } from '../../agent/entities/agent.constants';
import {
  AGENT_ROLE_PERMISSIONS,
  AgentPlatformRole,
} from '../../agent-platform/entities/agent-platform.constants';
import {
  AgentIpWhitelistEntry,
  AgentSecurityConfig,
  AGENT_SECURITY_SIGNATURE_ALGORITHM,
} from '../entities/agent-security.constants';
import { isIpAllowed, validateCidrOrIp } from '../utils/ip-cidr.util';
import { AgentApiTelemetryService } from './agent-api-telemetry.service';
import { assertValidWebhookDestination } from '../../webhook-delivery/utils/webhook-delivery-url.util';

@Injectable()
export class AgentSecurityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRepository: AgentRepository,
    private readonly credentialService: AgentCredentialService,
    private readonly telemetry: AgentApiTelemetryService,
    private readonly activityDispatcher: ActivityEventDispatcher,
    private readonly auditLogService: AuditLogService,
  ) {}

  assertPermission(role: AgentPlatformRole, permission: 'api.manage' | 'webhooks.manage') {
    if (!AGENT_ROLE_PERMISSIONS[role]?.includes(permission)) {
      throw new ForbiddenException('Không có quyền thực hiện thao tác này');
    }
  }

  parseSecurityConfig(raw: unknown): AgentSecurityConfig {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as AgentSecurityConfig;
  }

  private toSecurityJson(config: AgentSecurityConfig): Prisma.InputJsonValue {
    return config as Prisma.InputJsonValue;
  }

  async getDashboard(userId: string) {
    const agent = await this.requireAgent(userId);
    const config = this.parseSecurityConfig(agent.securityConfig);
    const usage = this.telemetry.getUsage(agent.id, agent.rateLimit);
    const webhook = await this.prisma.agentWebhookConfig.findUnique({ where: { agentId: agent.id } });
    const logs = await this.telemetry.listApiLogs(agent.id, undefined, undefined, 5);
    const events = await this.listSecurityEvents(agent.id, 5);

    return {
      apiEnabled: agent.apiEnabled,
      hasCredentials: !!agent.apiKeyHash,
      ipWhitelistCount: (config.ipWhitelist ?? []).filter((e) => e.enabled).length,
      webhookConfigured: !!webhook?.callbackUrl,
      rateLimit: agent.rateLimit,
      usage,
      recentLogs: logs.items,
      recentEvents: events.items,
    };
  }

  async getApiKeys(userId: string) {
    const agent = await this.requireAgent(userId);
    const config = this.parseSecurityConfig(agent.securityConfig);
    return {
      hasCredentials: !!agent.apiKeyHash,
      apiEnabled: agent.apiEnabled,
      apiKeyMasked: agent.apiKeyHash ? `${AGENT_API_KEY_PREFIX}${'•'.repeat(24)}` : null,
      label: config.apiKeyLabel ?? 'Primary Key',
      environment: config.apiKeyEnvironment ?? 'PRODUCTION',
      createdAt: agent.createdAt.toISOString(),
      lastUsedAt: agent.lastUsedAt?.toISOString() ?? null,
      lastUsedIp: config.lastUsedIp ?? null,
      expiresAt: config.apiKeyExpiresAt ?? null,
      status: !agent.apiEnabled
        ? 'DISABLED'
        : config.apiKeyExpiresAt && Date.parse(config.apiKeyExpiresAt) < Date.now()
          ? 'EXPIRED'
          : agent.apiKeyHash
            ? 'ACTIVE'
            : 'INACTIVE',
      permissions: ['cards.buy', 'balance.read', 'transactions.read'],
    };
  }

  async rotateApiKey(userId: string, role: AgentPlatformRole) {
    this.assertPermission(role, 'api.manage');
    const agent = await this.requireAgent(userId);
    if (!agent.apiKeyHash) {
      throw new BadRequestException('Chưa có khóa API — cần duyệt KYC trước');
    }

    const credentials = this.credentialService.generateCredentials();
    const config = this.parseSecurityConfig(agent.securityConfig);

    await this.agentRepository.saveApiCredentials(agent.id, {
      apiKeyHash: credentials.apiKeyHash,
      apiKeyLookup: credentials.apiKeyLookup,
      secretKeyEncrypted: credentials.secretKeyEncrypted,
      apiEnabled: true,
    });

    await this.prisma.agent.update({
      where: { id: agent.id },
      data: {
        securityConfig: this.toSecurityJson({
          ...config,
          apiKeyDisabledAt: null,
        }),
      },
    });

    this.dispatchSecurityEvent(agent.id, userId, 'API key rotated', 'API_KEY_ROTATED', {
      action: 'rotate',
    });

    return {
      apiKey: credentials.apiKey,
      secretKey: credentials.secretKey,
      message: 'Lưu khóa ngay — secret chỉ hiển thị một lần.',
    };
  }

  async disableApiKey(userId: string, role: AgentPlatformRole) {
    this.assertPermission(role, 'api.manage');
    const agent = await this.requireAgent(userId);
    const config = this.parseSecurityConfig(agent.securityConfig);
    await this.prisma.agent.update({
      where: { id: agent.id },
      data: {
        apiEnabled: false,
        securityConfig: this.toSecurityJson({
          ...config,
          apiKeyDisabledAt: new Date().toISOString(),
        }),
      },
    });
    this.dispatchSecurityEvent(agent.id, userId, 'API key disabled', 'API_KEY_DISABLED');
    return { ok: true, apiEnabled: false };
  }

  async enableApiKey(userId: string, role: AgentPlatformRole) {
    this.assertPermission(role, 'api.manage');
    const agent = await this.requireAgent(userId);
    if (!agent.apiKeyHash) throw new BadRequestException('Chưa có khóa API');
    await this.prisma.agent.update({
      where: { id: agent.id },
      data: { apiEnabled: true },
    });
    return { ok: true, apiEnabled: true };
  }

  async renameApiKey(userId: string, role: AgentPlatformRole, label: string) {
    this.assertPermission(role, 'api.manage');
    const agent = await this.requireAgent(userId);
    const config = this.parseSecurityConfig(agent.securityConfig);
    await this.prisma.agent.update({
      where: { id: agent.id },
      data: { securityConfig: this.toSecurityJson({ ...config, apiKeyLabel: label.trim() }) },
    });
    return { ok: true, label: label.trim() };
  }

  async updateApiKeyMeta(
    userId: string,
    role: AgentPlatformRole,
    body: { environment?: string; expiresAt?: string | null },
  ) {
    this.assertPermission(role, 'api.manage');
    const agent = await this.requireAgent(userId);
    const config = this.parseSecurityConfig(agent.securityConfig);
    await this.prisma.agent.update({
      where: { id: agent.id },
      data: {
        securityConfig: this.toSecurityJson({
          ...config,
          apiKeyEnvironment: body.environment === 'SANDBOX' ? 'SANDBOX' : 'PRODUCTION',
          apiKeyExpiresAt: body.expiresAt ?? config.apiKeyExpiresAt ?? null,
        }),
      },
    });
    return { ok: true };
  }

  async listIpWhitelist(userId: string, search?: string) {
    const agent = await this.requireAgent(userId);
    const config = this.parseSecurityConfig(agent.securityConfig);
    let items = config.ipWhitelist ?? [];
    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (e) => e.cidr.toLowerCase().includes(q) || e.description.toLowerCase().includes(q),
      );
    }
    return { items, total: items.length };
  }

  async createIpWhitelist(
    userId: string,
    role: AgentPlatformRole,
    body: { cidr: string; description?: string },
  ) {
    this.assertPermission(role, 'api.manage');
    if (!validateCidrOrIp(body.cidr)) {
      throw new BadRequestException('CIDR/IP không hợp lệ (IPv4, IPv6 hoặc CIDR)');
    }
    const agent = await this.requireAgent(userId);
    const config = this.parseSecurityConfig(agent.securityConfig);
    const entry: AgentIpWhitelistEntry = {
      id: randomUUID(),
      cidr: body.cidr.trim(),
      description: body.description?.trim() ?? '',
      enabled: true,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    };
    const ipWhitelist = [...(config.ipWhitelist ?? []), entry];
    await this.prisma.agent.update({
      where: { id: agent.id },
      data: { securityConfig: this.toSecurityJson({ ...config, ipWhitelist }) },
    });
    return entry;
  }

  async updateIpWhitelist(
    userId: string,
    role: AgentPlatformRole,
    id: string,
    body: { cidr?: string; description?: string; enabled?: boolean },
  ) {
    this.assertPermission(role, 'api.manage');
    const agent = await this.requireAgent(userId);
    const config = this.parseSecurityConfig(agent.securityConfig);
    const ipWhitelist = (config.ipWhitelist ?? []).map((e) => {
      if (e.id !== id) return e;
      if (body.cidr !== undefined) {
        if (!validateCidrOrIp(body.cidr)) throw new BadRequestException('CIDR/IP không hợp lệ');
        return { ...e, cidr: body.cidr.trim() };
      }
      return {
        ...e,
        description: body.description !== undefined ? body.description.trim() : e.description,
        enabled: body.enabled !== undefined ? body.enabled : e.enabled,
      };
    });
    if (!ipWhitelist.some((e) => e.id === id)) throw new NotFoundException('IP không tồn tại');
    await this.prisma.agent.update({
      where: { id: agent.id },
      data: { securityConfig: this.toSecurityJson({ ...config, ipWhitelist }) },
    });
    return ipWhitelist.find((e) => e.id === id);
  }

  async deleteIpWhitelist(userId: string, role: AgentPlatformRole, id: string) {
    this.assertPermission(role, 'api.manage');
    const agent = await this.requireAgent(userId);
    const config = this.parseSecurityConfig(agent.securityConfig);
    const ipWhitelist = (config.ipWhitelist ?? []).filter((e) => e.id !== id);
    if (ipWhitelist.length === (config.ipWhitelist ?? []).length) {
      throw new NotFoundException('IP không tồn tại');
    }
    await this.prisma.agent.update({
      where: { id: agent.id },
      data: { securityConfig: this.toSecurityJson({ ...config, ipWhitelist }) },
    });
    return { ok: true };
  }

  async getWebhookSecurity(userId: string) {
    const agent = await this.requireAgent(userId);
    const config = await this.prisma.agentWebhookConfig.findUnique({ where: { agentId: agent.id } });
    const sec = this.parseSecurityConfig(agent.securityConfig);
    return {
      configured: !!config,
      callbackUrl: config?.callbackUrl ?? null,
      enabled: config?.enabled ?? false,
      events: config?.events ?? [],
      signatureAlgorithm: config?.signatureAlgorithm ?? AGENT_SECURITY_SIGNATURE_ALGORITHM,
      secretMasked: config?.secretEncrypted ? `${'•'.repeat(32)}` : null,
      hasSecret: !!config?.secretEncrypted,
      updatedAt: config?.updatedAt?.toISOString() ?? null,
      history: sec.webhookSecretHistory ?? [],
      verificationExample: {
        header: 'X-CardOn-Signature',
        versionHeader: 'X-CardOn-Version',
        eventHeader: 'X-CardOn-Event',
        algorithm: AGENT_SECURITY_SIGNATURE_ALGORITHM,
        payload: 'timestamp + "." + rawBody',
        version: 'v1',
      },
    };
  }

  async updateWebhookSecurity(
    userId: string,
    role: AgentPlatformRole,
    body: { callbackUrl?: string; enabled?: boolean; events?: unknown[] },
  ) {
    this.assertPermission(role, 'webhooks.manage');
    const agent = await this.requireAgent(userId);
    const existing = await this.prisma.agentWebhookConfig.findUnique({ where: { agentId: agent.id } });

    if (body.callbackUrl) {
      assertValidWebhookDestination(body.callbackUrl);
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, role: true },
    });
    const auditActor = {
      performedBy: userId,
      performedEmail: actor?.email ?? 'partner@unknown',
      performedRole: actor?.role ?? UserRole.AGENT,
    };

    if (existing) {
      await this.prisma.agentWebhookConfig.update({
        where: { agentId: agent.id },
        data: {
          callbackUrl: body.callbackUrl ?? existing.callbackUrl,
          enabled: body.enabled ?? existing.enabled,
          events: (body.events ?? existing.events) as Prisma.InputJsonValue,
        },
      });
      this.auditWebhookConfig(auditActor, agent.id, existing, {
        callbackUrl: body.callbackUrl ?? existing.callbackUrl,
        enabled: body.enabled ?? existing.enabled,
      });
    } else if (body.callbackUrl) {
      const credentials = this.credentialService.generateCredentials();
      await this.prisma.agentWebhookConfig.create({
        data: {
          agentId: agent.id,
          callbackUrl: body.callbackUrl,
          enabled: body.enabled ?? true,
          events: (body.events ?? ['order.completed', 'order.failed']) as Prisma.InputJsonValue,
          secretEncrypted: credentials.secretKeyEncrypted,
        },
      });
      this.auditLogService.create({
        resource: SystemAuditResource.AGENT,
        resourceId: agent.id,
        resourceName: 'webhook_config',
        action: SystemAuditAction.CREATE,
        fieldName: 'callbackUrl',
        oldValue: null,
        newValue: { callbackUrl: body.callbackUrl, enabled: body.enabled ?? true },
        ...auditActor,
        reason: 'Partner webhook configuration created',
      });
    } else {
      throw new BadRequestException('callbackUrl required');
    }

    return this.getWebhookSecurity(userId);
  }

  async rotateWebhookSecret(userId: string, role: AgentPlatformRole) {
    this.assertPermission(role, 'webhooks.manage');
    const agent = await this.requireAgent(userId);
    const config = await this.prisma.agentWebhookConfig.findUnique({ where: { agentId: agent.id } });
    if (!config) throw new BadRequestException('Chưa cấu hình webhook');

    const credentials = this.credentialService.generateCredentials();
    const sec = this.parseSecurityConfig(agent.securityConfig);
    const history = [
      { at: new Date().toISOString(), by: userId, action: 'rotate' },
      ...(sec.webhookSecretHistory ?? []),
    ].slice(0, 20);

    await this.prisma.agentWebhookConfig.update({
      where: { agentId: agent.id },
      data: { secretEncrypted: credentials.secretKeyEncrypted },
    });
    await this.prisma.agent.update({
      where: { id: agent.id },
      data: { securityConfig: this.toSecurityJson({ ...sec, webhookSecretHistory: history }) },
    });

    this.dispatchSecurityEvent(agent.id, userId, 'Webhook secret rotated', 'WEBHOOK_SECRET_ROTATED');
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, role: true },
    });
    this.auditLogService.create({
      resource: SystemAuditResource.AGENT,
      resourceId: agent.id,
      resourceName: 'webhook_secret',
      action: SystemAuditAction.UPDATE,
      fieldName: 'secretEncrypted',
      oldValue: { rotated: true },
      newValue: { rotated: true },
      performedBy: userId,
      performedEmail: actor?.email ?? 'partner@unknown',
      performedRole: actor?.role ?? UserRole.AGENT,
      reason: 'Partner webhook secret rotated',
    });

    return {
      secret: credentials.secretKey,
      message: 'Lưu webhook secret ngay — chỉ hiển thị một lần.',
    };
  }

  getRateLimit(userId: string) {
    return this.requireAgent(userId).then((agent) => ({
      plan: 'STANDARD',
      ...this.telemetry.getUsage(agent.id, agent.rateLimit),
    }));
  }

  listApiLogs(userId: string, type?: string, search?: string, take = 50) {
    return this.requireAgent(userId).then((agent) =>
      this.telemetry.listApiLogs(agent.id, type as never, search, take),
    );
  }

  async listSecurityEvents(agentId: string, take = 25) {
    const rows = await this.prisma.systemActivityLog.findMany({
      where: {
        resourceId: agentId,
        eventCategory: { in: ['AUTH', 'SECURITY', 'API', 'WEBHOOK'] },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });

    return {
      items: rows.map((r) => ({
        id: r.id,
        at: r.createdAt.toISOString(),
        type: r.eventType,
        title: r.title,
        description: r.description,
        severity: r.severity,
        ip: r.ipAddress,
      })),
      total: rows.length,
    };
  }

  async listSecurityEventsForUser(userId: string, take = 50) {
    const agent = await this.requireAgent(userId);
    return this.listSecurityEvents(agent.id, take);
  }

  /** Called from AgentApiAuthService — not a portal endpoint */
  async validateApiAccess(params: {
    agentId: string;
    clientIp: string | null;
    method: string;
    path: string;
    success: boolean;
    errorType?: string;
    errorMessage?: string;
  }) {
    const agent = await this.agentRepository.findById(params.agentId);
    if (!agent) return;

    const config = this.parseSecurityConfig(agent.securityConfig);
    const ip = params.clientIp ?? null;

    if (params.success && ip && config.ipWhitelist?.length) {
      const updated = config.ipWhitelist.map((e) =>
        e.enabled && ipMatchesEntry(ip, e.cidr) ? { ...e, lastUsedAt: new Date().toISOString() } : e,
      );
      if (JSON.stringify(updated) !== JSON.stringify(config.ipWhitelist)) {
        await this.prisma.agent.update({
          where: { id: agent.id },
          data: { securityConfig: this.toSecurityJson({ ...config, ipWhitelist: updated, lastUsedIp: ip }) },
        });
      } else if (ip) {
        await this.prisma.agent.update({
          where: { id: agent.id },
          data: { securityConfig: this.toSecurityJson({ ...config, lastUsedIp: ip }) },
        });
      }
    }
  }

  checkIpWhitelist(agentId: string, securityConfig: unknown, clientIp: string | null): boolean {
    const config = this.parseSecurityConfig(securityConfig);
    const entries = config.ipWhitelist ?? [];
    if (entries.filter((e) => e.enabled).length === 0) return true;
    if (!clientIp) return false;
    return isIpAllowed(clientIp, entries);
  }

  recordAuthFailure(
    agentId: string | null,
    type: 'INVALID_KEY' | 'INVALID_SIGNATURE' | 'BLOCKED_IP' | 'EXPIRED_KEY' | 'FORBIDDEN' | 'AUTH_429',
    params: { ip: string | null; path: string; method: string; message: string },
  ) {
    if (!agentId) return;
    const logType =
      type === 'AUTH_429'
        ? 'AUTH_429'
        : type === 'BLOCKED_IP'
          ? 'BLOCKED_IP'
          : type === 'INVALID_SIGNATURE'
            ? 'INVALID_SIGNATURE'
            : type === 'EXPIRED_KEY'
              ? 'EXPIRED_KEY'
              : type === 'FORBIDDEN'
                ? 'AUTH_403'
                : 'INVALID_KEY';

    this.telemetry.recordApiLog(agentId, {
      type: logType,
      ip: params.ip,
      path: params.path,
      method: params.method,
      message: params.message,
    });
  }

  recordAuthSuccess(agentId: string, params: { ip: string | null; path: string; method: string }) {
    this.telemetry.recordApiLog(agentId, {
      type: 'AUTH_SUCCESS',
      ip: params.ip,
      path: params.path,
      method: params.method,
      message: 'Xác thực API thành công',
    });
  }

  private dispatchSecurityEvent(
    agentId: string,
    userId: string,
    title: string,
    eventType: string,
    metadata?: Record<string, unknown>,
  ) {
    this.activityDispatcher.dispatch({
      eventType: SystemActivityEventType.API_KEY_ROTATED,
      eventCategory: SystemActivityEventCategory.SECURITY,
      severity: SystemActivitySeverity.INFO,
      source: SystemActivitySource.PARTNER,
      resource: 'agent_security',
      resourceId: agentId,
      title,
      description: title,
      performedBy: userId,
      metadata: { agentId, eventType, ...metadata },
    });
  }

  private auditWebhookConfig(
    auditActor: { performedBy: string; performedEmail: string; performedRole: UserRole },
    agentId: string,
    existing: { callbackUrl: string; enabled: boolean },
    next: { callbackUrl: string; enabled: boolean },
  ) {
    if (existing.callbackUrl !== next.callbackUrl) {
      this.auditLogService.create({
        resource: SystemAuditResource.AGENT,
        resourceId: agentId,
        resourceName: 'webhook_config',
        action: SystemAuditAction.UPDATE,
        fieldName: 'callbackUrl',
        oldValue: existing.callbackUrl,
        newValue: next.callbackUrl,
        ...auditActor,
        reason: 'Partner webhook URL updated',
      });
    }
    if (existing.enabled !== next.enabled) {
      this.auditLogService.create({
        resource: SystemAuditResource.AGENT,
        resourceId: agentId,
        resourceName: 'webhook_config',
        action: SystemAuditAction.UPDATE,
        fieldName: 'enabled',
        oldValue: existing.enabled,
        newValue: next.enabled,
        ...auditActor,
        reason: next.enabled ? 'Partner webhook enabled' : 'Partner webhook disabled',
      });
    }
  }

  private async requireAgent(userId: string) {
    const agent = await this.agentRepository.findByUserId(userId);
    if (!agent) throw new NotFoundException('Agent profile not found');
    return agent;
  }
}

function ipMatchesEntry(clientIp: string, cidr: string): boolean {
  return isIpAllowed(clientIp, [{ cidr, enabled: true }]);
}
