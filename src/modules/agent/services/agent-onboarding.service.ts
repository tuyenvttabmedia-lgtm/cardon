import { Injectable, NotFoundException } from '@nestjs/common';
import { AgentKycStatus, AgentStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AgentRepository } from '../repositories/agent.repository';

export type OnboardingGateFlags = {
  canUseWallet: boolean;
  canUseOrders: boolean;
  canUseApi: boolean;
  canUseDeposits: boolean;
  canUseReports: boolean;
  canUseInvoices: boolean;
};

export type OnboardingStatus = {
  emailVerified: boolean;
  hasAgent: boolean;
  agentStatus: AgentStatus | null;
  kycStatus: AgentKycStatus | null;
  accountType: string | null;
  gates: OnboardingGateFlags;
  banner: string | null;
  kycPath: string;
};

@Injectable()
export class AgentOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRepository: AgentRepository,
  ) {}

  async getOnboardingStatus(userId: string): Promise<OnboardingStatus> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const emailVerified = user.emailVerifiedAt !== null;
    const agent = await this.agentRepository.findByUserId(userId);
    const kycStatus = agent?.kyc?.status ?? null;
    const agentStatus = agent?.status ?? null;
    const approved = agentStatus === AgentStatus.ACTIVE && kycStatus === AgentKycStatus.APPROVED;
    const unlocked = emailVerified && approved;

    const security = (agent?.securityConfig ?? {}) as Record<string, unknown>;
    const onboarding = security.onboarding as Record<string, unknown> | undefined;
    const accountType = typeof onboarding?.accountType === 'string' ? onboarding.accountType : null;

    let banner: string | null = null;
    if (!emailVerified) {
      banner = 'Xác minh email và hoàn tất KYC để kích hoạt dịch vụ đại lý.';
    } else if (!agent) {
      banner = 'Vui lòng hoàn tất đăng ký hồ sơ đại lý.';
    } else if (kycStatus === AgentKycStatus.SUBMITTED) {
      banner = 'KYC đang chờ CardOn duyệt. Bạn sẽ nhận thông báo khi hoàn tất.';
    } else if (kycStatus === AgentKycStatus.NEED_MORE_INFO) {
      banner = 'CardOn yêu cầu bổ sung hồ sơ KYC. Vui lòng cập nhật và nộp lại.';
    } else if (agentStatus === AgentStatus.REJECTED || kycStatus === AgentKycStatus.REJECTED) {
      banner = 'KYC bị từ chối. Vui lòng cập nhật hồ sơ và nộp lại.';
    } else if (!approved) {
      banner = 'Vui lòng hoàn thiện xác minh KYC để sử dụng dịch vụ.';
    }

    return {
      emailVerified,
      hasAgent: !!agent,
      agentStatus,
      kycStatus,
      accountType,
      gates: {
        canUseWallet: unlocked,
        canUseOrders: unlocked,
        canUseApi: unlocked,
        canUseDeposits: unlocked,
        canUseReports: unlocked,
        canUseInvoices: unlocked,
      },
      banner,
      kycPath: '/account/kyc',
    };
  }

  isStaffBypass(role: UserRole): boolean {
    return role !== UserRole.AGENT;
  }
}
