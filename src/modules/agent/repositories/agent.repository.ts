import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  Agent,
  AgentKyc,
  AgentKycStatus,
  AgentMemberRole,
  AgentMemberStatus,
  AgentStatus,
  OrderChannel,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

export type AgentWithKyc = Agent & { kyc: AgentKyc | null };

@Injectable()
export class AgentRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<AgentWithKyc | null> {
    return this.prisma.agent.findFirst({
      where: { id, deletedAt: null },
      include: { kyc: true },
    });
  }

  findByUserId(userId: string): Promise<AgentWithKyc | null> {
    return this.resolveAgentForPortalUser(userId);
  }

  async resolveAgentForPortalUser(userId: string): Promise<AgentWithKyc | null> {
    const member = await this.prisma.agentMember.findUnique({
      where: { userId },
      include: { agent: { include: { kyc: true } } },
    });
    if (member?.agent && !member.agent.deletedAt) {
      return member.agent;
    }
    return this.prisma.agent.findFirst({
      where: { userId, deletedAt: null },
      include: { kyc: true },
    });
  }

  create(data: {
    userId: string;
    companyName: string;
    contactEmail?: string;
  }): Promise<Agent> {
    return this.prisma.agent.create({
      data: {
        userId: data.userId,
        companyName: data.companyName,
        contactEmail: data.contactEmail,
        status: AgentStatus.PENDING_KYC,
        apiEnabled: false,
      },
    });
  }

  updateStatus(id: string, status: AgentStatus, extra?: Prisma.AgentUpdateInput) {
    return this.prisma.agent.update({
      where: { id },
      data: {
        status,
        ...extra,
      },
    });
  }

  saveApiCredentials(
    id: string,
    data: {
      apiKeyHash: string;
      apiKeyLookup: string;
      secretKeyEncrypted: string;
      apiEnabled: boolean;
    },
  ) {
    return this.prisma.agent.update({
      where: { id },
      data: {
        apiKeyHash: data.apiKeyHash,
        apiKeyLookup: data.apiKeyLookup,
        secretKeyEncrypted: data.secretKeyEncrypted,
        apiEnabled: data.apiEnabled,
      },
    });
  }

  findByApiKeyLookup(apiKeyLookup: string) {
    return this.prisma.agent.findFirst({
      where: { apiKeyLookup, deletedAt: null },
    });
  }

  touchLastUsedAt(id: string) {
    return this.prisma.agent.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

  lockForUpdate(id: string, tx: Prisma.TransactionClient) {
    return tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM agents WHERE id = ${id}::uuid AND deleted_at IS NULL FOR UPDATE
    `;
  }

  findByIdInTransaction(id: string, tx: Prisma.TransactionClient) {
    return tx.agent.findFirst({
      where: { id, deletedAt: null },
    });
  }

  updateBalancesInTransaction(
    id: string,
    data: { balance: Prisma.Decimal; heldBalance: Prisma.Decimal },
    tx: Prisma.TransactionClient,
  ) {
    return tx.agent.update({
      where: { id },
      data: {
        balance: data.balance,
        heldBalance: data.heldBalance,
      },
    });
  }

  listAgentOrders(agentId: string, skip = 0, take = 20) {
    return this.prisma.order.findMany({
      where: {
        agentId,
        channel: OrderChannel.AGENT,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        orderItems: {
          include: {
            variant: { select: { sku: true, name: true } },
          },
        },
      },
    });
  }

  findOrderByAgentRequestId(agentId: string, agentRequestId: string) {
    return this.prisma.order.findFirst({
      where: {
        agentId,
        agentRequestId,
        deletedAt: null,
      },
      include: {
        orderItems: {
          include: {
            variant: { select: { sku: true } },
            cardRecords: true,
          },
        },
      },
    });
  }
}

@Injectable()
export class AgentKycRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsertSubmitted(
    agentId: string,
    data: {
      accountType: import('@prisma/client').AgentAccountType;
      profile: Record<string, unknown>;
      documents: Record<string, string>;
      businessProfile: Record<string, unknown>;
      companyName: string;
      taxCode: string;
      representativeName: string;
      documentFront: string;
      documentBack: string;
      businessLicense: string;
    },
  ) {
    return this.prisma.agentKyc.upsert({
      where: { agentId },
      create: {
        agentId,
        accountType: data.accountType,
        profile: data.profile as Prisma.InputJsonValue,
        documents: data.documents as Prisma.InputJsonValue,
        businessProfile: data.businessProfile as Prisma.InputJsonValue,
        companyName: data.companyName,
        taxCode: data.taxCode,
        representativeName: data.representativeName,
        documentFront: data.documentFront,
        documentBack: data.documentBack,
        businessLicense: data.businessLicense,
        status: AgentKycStatus.SUBMITTED,
        reviewNote: null,
        requestedFields: Prisma.DbNull,
      },
      update: {
        accountType: data.accountType,
        profile: data.profile as Prisma.InputJsonValue,
        documents: data.documents as Prisma.InputJsonValue,
        businessProfile: data.businessProfile as Prisma.InputJsonValue,
        companyName: data.companyName,
        taxCode: data.taxCode,
        representativeName: data.representativeName,
        documentFront: data.documentFront,
        documentBack: data.documentBack,
        businessLicense: data.businessLicense,
        status: AgentKycStatus.SUBMITTED,
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
        requestedFields: Prisma.DbNull,
      },
    });
  }

  approve(agentId: string, reviewedById: string) {
    return this.prisma.agentKyc.update({
      where: { agentId },
      data: {
        status: AgentKycStatus.APPROVED,
        reviewedById,
        reviewedAt: new Date(),
      },
    });
  }

  reject(agentId: string, reviewedById: string) {
    return this.prisma.agentKyc.update({
      where: { agentId },
      data: {
        status: AgentKycStatus.REJECTED,
        reviewedById,
        reviewedAt: new Date(),
      },
    });
  }

  requestMoreInfo(
    agentId: string,
    reviewedById: string,
    data: { reason: string; fields?: string[] },
  ) {
    return this.prisma.agentKyc.update({
      where: { agentId },
      data: {
        status: AgentKycStatus.NEED_MORE_INFO,
        reviewedById,
        reviewedAt: new Date(),
        reviewNote: data.reason,
        requestedFields: (data.fields ?? []) as Prisma.InputJsonValue,
      },
    });
  }
}

@Injectable()
export class AgentUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  ensureOwnerMember(agentId: string, userId: string) {
    return this.prisma.agentMember.findUnique({ where: { userId } }).then(async (existing) => {
      if (existing) return existing;
      return this.prisma.agentMember.create({
        data: {
          agentId,
          userId,
          role: AgentMemberRole.OWNER,
          status: AgentMemberStatus.ACTIVE,
        },
      });
    });
  }

  promoteToAgent(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { role: UserRole.AGENT },
    });
  }

  assertCanReviewKyc(reviewerId: string, agentUserId: string): void {
    if (reviewerId === agentUserId) {
      throw new ForbiddenException('Agents cannot review their own KYC');
    }
  }
}
