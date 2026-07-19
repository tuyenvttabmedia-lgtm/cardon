import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AgentStatus, AuditTargetType } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { NotificationService } from '../../notification/services/notification.service';
import { AgentService } from '../../agent/services/agent.service';
import { AgentRepository } from '../../agent/repositories/agent.repository';
import { AdminAgentQueryDto, AdminSuspendAgentDto, AdminUpdateAgentDto } from '../dto/admin.dto';import { mapAdminAgent } from '../entities/admin-agent.mapper';
import { ADMIN_AUDIT_ACTIONS } from '../entities/admin.constants';
import { AdminRepository } from '../repositories/admin.repository';
import { AdminAuditService } from './admin-audit.service';

@Injectable()
export class AdminAgentService {
  constructor(
    private readonly repository: AdminRepository,
    private readonly agentRepository: AgentRepository,
    private readonly agentService: AgentService,
    private readonly adminAudit: AdminAuditService,
    private readonly notificationService: NotificationService,
    private readonly prisma: PrismaService,
  ) {}

  async listAgents(query: AdminAgentQueryDto) {
    const agents = await this.repository.findAgentsAdmin({
      status: query.status,
      skip: query.skip,
      take: query.take,
    });
    return agents.map(mapAdminAgent);
  }

  async getAgent(agentId: string) {
    const agent = await this.repository.findAgentById(agentId);
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    return mapAdminAgent(agent);
  }

  suspendAgent(adminId: string, agentId: string, dto: AdminSuspendAgentDto) {
    return this.agentService.suspendAgent(adminId, agentId, dto.reason);
  }

  reactivateAgent(adminId: string, agentId: string) {
    return this.agentService.reactivateAgent(adminId, agentId);
  }

  async updateAgent(adminId: string, agentId: string, dto: AdminUpdateAgentDto) {
    const agent = await this.requireAgent(agentId);
    await this.prisma.agent.update({
      where: { id: agent.id },
      data: {
        companyName: dto.companyName?.trim(),
        contactEmail: dto.contactEmail?.trim().toLowerCase(),
        rateLimit: dto.rateLimit,
      },
    });
    await this.adminAudit.record(
      adminId,
      ADMIN_AUDIT_ACTIONS.ADMIN_AGENT_UPDATED,
      AuditTargetType.AGENT,
      agentId,
      { fields: Object.keys(dto) },
    );
    return this.getAgent(agentId);
  }

  async deleteAgent(adminId: string, agentId: string) {
    const agent = await this.requireAgent(agentId);
    const [orders, ledger] = await Promise.all([
      this.prisma.order.count({ where: { agentId: agent.id } }),
      this.prisma.ledgerEntry.count({ where: { agentId: agent.id } }),
    ]);
    if (orders > 0 || ledger > 0) {
      throw new ConflictException('Agent has transactions — suspend only');
    }
    await this.prisma.agent.update({
      where: { id: agent.id },
      data: { deletedAt: new Date(), status: AgentStatus.SUSPENDED, apiEnabled: false },
    });
    await this.adminAudit.record(
      adminId,
      ADMIN_AUDIT_ACTIONS.ADMIN_AGENT_DELETED,
      AuditTargetType.AGENT,
      agentId,
      {},
    );
    return { deleted: true, agentId };
  }

  async enableApi(adminId: string, agentId: string) {
    const agent = await this.requireActiveAgent(agentId);
    await this.agentRepository.updateStatus(agent.id, AgentStatus.ACTIVE, {
      apiEnabled: true,
    });

    await this.adminAudit.record(
      adminId,
      ADMIN_AUDIT_ACTIONS.ADMIN_AGENT_API_ENABLED,
      AuditTargetType.AGENT,
      agentId,
    );

    return { agentId, apiEnabled: true };
  }

  async disableApi(adminId: string, agentId: string) {
    const agent = await this.requireAgent(agentId);
    await this.agentRepository.updateStatus(agent.id, agent.status, {
      apiEnabled: false,
    });

    await this.adminAudit.record(
      adminId,
      ADMIN_AUDIT_ACTIONS.ADMIN_AGENT_API_DISABLED,
      AuditTargetType.AGENT,
      agentId,
    );

    await this.notificationService.notifyAgentApiDisabled(agentId);

    return { agentId, apiEnabled: false };
  }

  rotateApiKey(adminId: string, agentId: string) {
    return this.agentService.rotateApiKeyByAdmin(adminId, agentId);
  }

  private async requireAgent(agentId: string) {
    const agent = await this.repository.findAgentById(agentId);
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    return agent;
  }

  private async requireActiveAgent(agentId: string) {
    const agent = await this.requireAgent(agentId);
    if (agent.status !== AgentStatus.ACTIVE) {
      throw new BadRequestException('Agent must be ACTIVE to enable API');
    }
    if (!agent.apiKeyHash) {
      throw new BadRequestException('Agent has no API credentials');
    }
    return agent;
  }
}
