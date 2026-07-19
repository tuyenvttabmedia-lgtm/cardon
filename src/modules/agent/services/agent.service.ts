import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgentKycStatus,
  AgentStatus,
  LedgerReferenceType,
  SystemActivityEventCategory,
  SystemActivityEventType,
  SystemActivitySeverity,
  SystemActivitySource,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  assertVndAmountRange,
  parseVndAmount,
} from '../../../common/utils/vnd-amount.util';
import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';
import {
  CreditAgentDto,
  RegisterAgentDto,
  RejectKycDto,
  RequestMoreInfoKycDto,
  SubmitKycDto,
} from '../dto/agent.dto';
import {
  AgentKycRepository,
  AgentRepository,
  AgentUserRepository,
} from '../repositories/agent.repository';
import { CardEncryptionService } from '../../provider/services/card-encryption.service';
import {
  mapPartnerOrderResponse,
} from '../../agent-api/entities/agent-api.mapper';
import {
  AGENT_API_KEY_PREFIX,
} from '../entities/agent.constants';
import { AgentAuditService } from './agent-audit.service';
import { AgentCredentialService } from './agent-credential.service';
import { AgentBalanceSnapshot, LedgerService } from './ledger.service';
import { NotificationService } from '../../notification/services/notification.service';
import { AgentInviteService } from './agent-invite.service';
import { AgentKycDocumentService } from './agent-kyc-document.service';
import { mapLegacyKycFields, resolveDisplayCompanyName } from '../entities/kyc-profile.util';

@Injectable()
export class AgentService {
  constructor(
    private readonly agentRepository: AgentRepository,
    private readonly kycRepository: AgentKycRepository,
    private readonly userRepository: AgentUserRepository,
    private readonly credentialService: AgentCredentialService,
    private readonly ledgerService: LedgerService,
    private readonly agentAudit: AgentAuditService,
    private readonly notificationService: NotificationService,
    private readonly cardEncryption: CardEncryptionService,
    private readonly agentInviteService: AgentInviteService,
    private readonly activityDispatcher: ActivityEventDispatcher,
    private readonly kycDocumentService: AgentKycDocumentService,
  ) {}

  async registerAgent(userId: string, dto: RegisterAgentDto) {
    const invite = await this.agentInviteService.requireInviteForMode(dto.inviteToken);

    const existing = await this.agentRepository.findByUserId(userId);
    if (existing) {
      throw new ConflictException('Agent profile already exists');
    }

    const agent = await this.agentRepository.create({
      userId,
      companyName: dto.companyName,
      contactEmail: dto.contactEmail,
    });

    await this.agentAudit.recordRegistered(userId, agent.id);

    if (invite) {
      await this.agentInviteService.consumeInvite(invite.id, userId);
    }

    return this.mapAgent(agent);
  }

  async submitKyc(userId: string, dto: SubmitKycDto) {
    const agent = await this.requireOwnAgent(userId);
    if (
      agent.status !== AgentStatus.PENDING_KYC &&
      agent.status !== AgentStatus.REJECTED
    ) {
      throw new BadRequestException('KYC cannot be submitted in current status');
    }

    const currentKycStatus = agent.kyc?.status;
    if (
      currentKycStatus === AgentKycStatus.SUBMITTED ||
      currentKycStatus === AgentKycStatus.APPROVED
    ) {
      throw new ConflictException('KYC already submitted or approved');
    }

    const legacy =
      dto.companyName && dto.taxCode
        ? {
            companyName: dto.companyName,
            taxCode: dto.taxCode,
            representativeName: dto.representativeName ?? '',
            documentFront: dto.documentFront ?? '',
            documentBack: dto.documentBack ?? '',
            businessLicense: dto.businessLicense ?? '',
          }
        : mapLegacyKycFields(dto.accountType, dto.profile, dto.documents);

    const companyName = resolveDisplayCompanyName(
      dto.accountType,
      dto.profile,
      legacy.companyName || agent.companyName,
    );

    await this.kycRepository.upsertSubmitted(agent.id, {
      accountType: dto.accountType,
      profile: dto.profile,
      documents: dto.documents,
      businessProfile: dto.businessProfile,
      ...legacy,
    });

    await this.agentRepository.updateStatus(agent.id, AgentStatus.PENDING_KYC, {
      companyName,
    });

    await this.agentAudit.recordKycSubmitted(userId, agent.id);

    return { agentId: agent.id, kycStatus: AgentKycStatus.SUBMITTED };
  }

  async getMyKyc(userId: string) {
    const agent = await this.requireOwnAgent(userId);
    const security = (agent.securityConfig ?? {}) as Record<string, unknown>;
    const onboarding = security.onboarding as Record<string, unknown> | undefined;
    const registeredAccountType =
      typeof onboarding?.accountType === 'string' ? onboarding.accountType : null;

    if (!agent.kyc) {
      return {
        status: AgentKycStatus.PENDING,
        accountType: registeredAccountType,
        profile: null,
        documents: null,
        businessProfile: null,
        reviewNote: null,
        requestedFields: null,
        legacy: null,
      };
    }

    return {
      status: agent.kyc.status,
      accountType: agent.kyc.accountType ?? registeredAccountType,
      profile: agent.kyc.profile,
      documents: agent.kyc.documents,
      businessProfile: agent.kyc.businessProfile,
      reviewNote: agent.kyc.reviewNote,
      requestedFields: agent.kyc.requestedFields,
      reviewedAt: agent.kyc.reviewedAt,
      legacy: {
        companyName: agent.kyc.companyName,
        taxCode: agent.kyc.taxCode,
        representativeName: agent.kyc.representativeName,
        documentFront: agent.kyc.documentFront,
        documentBack: agent.kyc.documentBack,
        businessLicense: agent.kyc.businessLicense,
      },
    };
  }

  async uploadKycDocument(userId: string, field: string, file: Express.Multer.File) {
    const agent = await this.requireOwnAgent(userId);
    if (
      agent.kyc?.status === AgentKycStatus.SUBMITTED ||
      agent.kyc?.status === AgentKycStatus.APPROVED
    ) {
      throw new BadRequestException('Cannot upload documents while KYC is under review');
    }
    return this.kycDocumentService.saveDocument(agent.id, field, file);
  }

  async openKycDocument(userId: string, storageKey: string) {
    const agent = await this.requireOwnAgent(userId);
    const filePath = this.kycDocumentService.resolveFilePath(agent.id, storageKey);
    const { createReadStream, existsSync } = await import('fs');
    const { basename } = await import('path');
    if (!existsSync(filePath)) {
      throw new NotFoundException('Document not found');
    }
    const filename = basename(filePath);
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeType =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'svg'
            ? 'image/svg+xml'
            : 'image/jpeg';
    return {
      stream: createReadStream(filePath),
      mimeType,
      filename,
    };
  }

  async getMyAgent(userId: string) {
    const agent = await this.agentRepository.findByUserId(userId);
    if (!agent) {
      throw new NotFoundException('Agent profile not found');
    }

    const balance = await this.ledgerService.getBalance(agent.id);
    return {
      ...this.mapAgent(agent),
      kyc: agent.kyc,
      balance,
    };
  }

  async getMyLedger(userId: string) {
    const agent = await this.requireOwnAgent(userId);
    const entries = await this.ledgerService.getHistory(agent.id);
    return entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      amount: entry.amount.toFixed(2),
      beforeBalance: entry.beforeBalance.toFixed(2),
      afterBalance: entry.afterBalance.toFixed(2),
      beforeHeld: entry.beforeHeld.toFixed(2),
      afterHeld: entry.afterHeld.toFixed(2),
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      description: entry.description,
      createdAt: entry.createdAt,
    }));
  }

  async listMyTransactions(
    userId: string,
    options: { skip?: number; take?: number } = {},
  ) {
    const agent = await this.requireOwnAgent(userId);
    const skip = options.skip ?? 0;
    const take = Math.min(options.take ?? 20, 50);
    const orders = await this.agentRepository.listAgentOrders(
      agent.id,
      skip,
      take,
    );

    return orders.map((order) => {
      const item = order.orderItems[0];
      return {
        request_id: order.agentRequestId ?? '',
        product_code: item?.variant.sku ?? '',
        product_name: item?.variant.name ?? '',
        amount: order.totalAmount.toFixed(2),
        status: this.resolvePortalTransactionStatus(order.fulfillmentStatus),
        created_at: order.createdAt,
      };
    });
  }

  async getMyTransaction(userId: string, requestId: string) {
    const agent = await this.requireOwnAgent(userId);
    const order = await this.agentRepository.findOrderByAgentRequestId(
      agent.id,
      requestId,
    );
    if (!order) {
      throw new NotFoundException('Transaction not found');
    }

    return mapPartnerOrderResponse(
      order as never,
      this.cardEncryption,
    );
  }

  async getMyCredentialsStatus(userId: string) {
    const agent = await this.requireOwnAgent(userId);
    return {
      hasCredentials: !!agent.apiKeyHash,
      apiEnabled: agent.apiEnabled,
      apiKeyMasked: agent.apiKeyHash
        ? `${AGENT_API_KEY_PREFIX}${'•'.repeat(24)}`
        : null,
      lastUsedAt: agent.lastUsedAt,
      createdAt: agent.kyc?.reviewedAt ?? agent.updatedAt,
      status: agent.apiEnabled ? 'ACTIVE' : 'INACTIVE',
    };
  }

  async approveKyc(reviewerId: string, agentId: string, reviewerRole: UserRole) {
    this.assertKycReviewer(reviewerRole);
    const agent = await this.requireAgent(agentId);
    this.userRepository.assertCanReviewKyc(reviewerId, agent.userId);

    if (!agent.kyc || agent.kyc.status !== AgentKycStatus.SUBMITTED) {
      throw new BadRequestException('KYC must be SUBMITTED before approval');
    }

    const credentials = this.credentialService.generateCredentials();
    const companyName = resolveDisplayCompanyName(
      agent.kyc.accountType,
      (agent.kyc.profile as Record<string, unknown> | null) ?? null,
      agent.kyc.companyName || agent.companyName,
    );

    await this.kycRepository.approve(agent.id, reviewerId);
    await this.agentRepository.updateStatus(agent.id, AgentStatus.ACTIVE, { companyName });
    await this.agentRepository.saveApiCredentials(agent.id, {
      apiKeyHash: credentials.apiKeyHash,
      apiKeyLookup: credentials.apiKeyLookup,
      secretKeyEncrypted: credentials.secretKeyEncrypted,
      apiEnabled: true,
    });
    await this.userRepository.promoteToAgent(agent.userId);
    await this.userRepository.ensureOwnerMember(agent.id, agent.userId);

    await this.agentAudit.recordKycApproved(reviewerId, agent.id);
    await this.agentAudit.recordApiKeyGenerated(reviewerId, agent.id);
    this.activityDispatcher.dispatch({
      eventType: SystemActivityEventType.API_KEY_ROTATED,
      eventCategory: SystemActivityEventCategory.AUTH,
      severity: SystemActivitySeverity.INFO,
      source: SystemActivitySource.ADMIN,
      resource: 'agent',
      resourceId: agent.id,
      resourceDisplay: agent.companyName,
      title: 'API Key Rotated',
      description: `New API credentials issued for agent ${agent.companyName}`,
      performedBy: reviewerId,
      performedRole: reviewerRole,
      metadata: { agentId: agent.id },
    });
    await this.notificationService.notifyAgentApproved(agent.id);

    return {
      agentId: agent.id,
      status: AgentStatus.ACTIVE,
      apiKey: credentials.apiKey,
      secretKey: credentials.secretKey,
      message:
        'Store API credentials securely. Secret key will not be shown again.',
    };
  }

  async rotateApiKeyByAdmin(adminId: string, agentId: string) {
    const agent = await this.requireAgent(agentId);
    if (!agent.apiKeyHash) {
      throw new BadRequestException(
        'Agent has no API credentials — approve KYC first',
      );
    }

    const credentials = this.credentialService.generateCredentials();
    await this.agentRepository.saveApiCredentials(agent.id, {
      apiKeyHash: credentials.apiKeyHash,
      apiKeyLookup: credentials.apiKeyLookup,
      secretKeyEncrypted: credentials.secretKeyEncrypted,
      apiEnabled: agent.apiEnabled,
    });

    await this.agentAudit.recordApiKeyGenerated(adminId, agent.id);
    this.activityDispatcher.dispatch({
      eventType: SystemActivityEventType.API_KEY_ROTATED,
      eventCategory: SystemActivityEventCategory.AUTH,
      severity: SystemActivitySeverity.INFO,
      source: SystemActivitySource.ADMIN,
      resource: 'agent',
      resourceId: agent.id,
      resourceDisplay: agent.companyName,
      title: 'API Key Rotated',
      description: `Admin rotated API credentials for agent ${agent.companyName}`,
      performedBy: adminId,
      metadata: { agentId: agent.id, rotatedBy: 'admin' },
    });

    return {
      agentId: agent.id,
      apiKey: credentials.apiKey,
      secretKey: credentials.secretKey,
      message: 'Lưu khóa ngay — secret chỉ hiển thị một lần.',
    };
  }

  async rejectKyc(
    reviewerId: string,
    agentId: string,
    reviewerRole: UserRole,
    reason?: string,
  ) {
    this.assertKycReviewer(reviewerRole);
    const agent = await this.requireAgent(agentId);
    this.userRepository.assertCanReviewKyc(reviewerId, agent.userId);

    if (!agent.kyc || agent.kyc.status !== AgentKycStatus.SUBMITTED) {
      throw new BadRequestException('KYC must be SUBMITTED before rejection');
    }

    await this.kycRepository.reject(agent.id, reviewerId);
    await this.agentRepository.updateStatus(agent.id, AgentStatus.REJECTED, {
      apiEnabled: false,
    });

    await this.agentAudit.recordKycRejected(reviewerId, agent.id, reason);
    await this.notificationService.notifyAgentKycRejected(agent.id, reason);

    return { agentId: agent.id, status: AgentStatus.REJECTED };
  }

  async requestMoreInfoKyc(
    reviewerId: string,
    agentId: string,
    reviewerRole: UserRole,
    dto: RequestMoreInfoKycDto,
  ) {
    this.assertKycReviewer(reviewerRole);
    const agent = await this.requireAgent(agentId);
    this.userRepository.assertCanReviewKyc(reviewerId, agent.userId);

    if (!agent.kyc || agent.kyc.status !== AgentKycStatus.SUBMITTED) {
      throw new BadRequestException('KYC must be SUBMITTED before requesting more info');
    }

    await this.kycRepository.requestMoreInfo(agent.id, reviewerId, {
      reason: dto.reason,
      fields: dto.fields,
    });
    await this.agentRepository.updateStatus(agent.id, AgentStatus.PENDING_KYC, {
      apiEnabled: false,
    });

    await this.agentAudit.recordKycNeedMoreInfo(reviewerId, agent.id, dto.reason, dto.fields);
    await this.notificationService.notifyAgentKycNeedMoreInfo(agent.id, dto.reason, dto.fields);

    return { agentId: agent.id, status: AgentKycStatus.NEED_MORE_INFO };
  }

  async suspendAgent(
    adminId: string,
    agentId: string,
    reason?: string,
  ) {
    const agent = await this.requireAgent(agentId);
    if (agent.status === AgentStatus.SUSPENDED) {
      throw new ConflictException('Agent already suspended');
    }

    await this.agentRepository.updateStatus(agent.id, AgentStatus.SUSPENDED, {
      apiEnabled: false,
    });

    await this.agentAudit.recordSuspended(adminId, agent.id, reason);

    return { agentId: agent.id, status: AgentStatus.SUSPENDED };
  }

  async reactivateAgent(adminId: string, agentId: string) {
    const agent = await this.requireAgent(agentId);
    if (agent.status !== AgentStatus.SUSPENDED) {
      throw new ConflictException('Agent is not suspended');
    }

    await this.agentRepository.updateStatus(agent.id, AgentStatus.ACTIVE, {});

    await this.agentAudit.recordSuspended(adminId, agent.id, 'reactivated');

    return { agentId: agent.id, status: AgentStatus.ACTIVE };
  }

  async creditAgent(adminId: string, dto: CreditAgentDto) {
    const agent = await this.requireAgent(dto.agentId);
    if (agent.status !== AgentStatus.ACTIVE) {
      throw new BadRequestException('Agent must be ACTIVE to receive credit');
    }

    const amount = parseVndAmount(dto.amount);
    assertVndAmountRange(amount);
    const referenceId = randomUUID();

    const entry = await this.ledgerService.credit(
      agent.id,
      amount,
      LedgerReferenceType.TOPUP,
      referenceId,
      adminId,
      dto.note ?? 'Admin manual credit',
    );

    await this.agentAudit.recordCredited(adminId, agent.id, {
      amount: amount.toFixed(2),
      referenceId,
    });

    const balance = await this.ledgerService.getBalance(agent.id);

    return {
      agentId: agent.id,
      ledgerEntryId: entry.id,
      amount: amount.toFixed(2),
      balance,
    };
  }

  async getAgentBalance(agentId: string): Promise<AgentBalanceSnapshot> {
    await this.requireAgent(agentId);
    return this.ledgerService.getBalance(agentId);
  }

  async getAgentLedger(agentId: string) {
    await this.requireAgent(agentId);
    return this.ledgerService.getHistory(agentId);
  }

  private assertKycReviewer(role: UserRole) {
    if (
      role !== UserRole.ADMIN &&
      role !== UserRole.SUPPORT &&
      role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException('Only ADMIN, SUPPORT, or SUPER_ADMIN can review KYC');
    }
  }

  private async requireAgent(agentId: string) {
    const agent = await this.agentRepository.findById(agentId);
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    return agent;
  }

  private async requireOwnAgent(userId: string) {
    const agent = await this.agentRepository.findByUserId(userId);
    if (!agent) {
      throw new NotFoundException('Agent profile not found');
    }
    return agent;
  }

  private resolvePortalTransactionStatus(
    fulfillmentStatus: string,
  ): 'SUCCESS' | 'PROCESSING' | 'FAILED' {
    if (fulfillmentStatus === 'COMPLETED') return 'SUCCESS';
    if (fulfillmentStatus === 'FAILED') return 'FAILED';
    return 'PROCESSING';
  }

  private mapAgent(agent: {
    id: string;
    userId: string;
    companyName: string;
    status: AgentStatus;
    contactEmail: string | null;
    apiEnabled: boolean;
    createdAt: Date;
  }) {
    return {
      id: agent.id,
      userId: agent.userId,
      companyName: agent.companyName,
      status: agent.status,
      contactEmail: agent.contactEmail,
      apiEnabled: agent.apiEnabled,
      createdAt: agent.createdAt,
    };
  }
}
