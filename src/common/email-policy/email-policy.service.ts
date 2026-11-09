import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import {
  EMAIL_POLICY_REJECT_MESSAGE,
  evaluateEmailDomain,
  normalizeEmailAddress,
  type EmailPolicyRuleId,
} from './email-policy';

@Injectable()
export class EmailPolicyService {
  private readonly logger = new Logger(EmailPolicyService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Enforce deny-list for registration intake (customer + agent-register).
   * Does not mutate users or emailVerifiedAt.
   */
  assertRegistrationEmailAllowed(email: string): void {
    const enabled = this.configService.get<boolean>('emailPolicy.enabled');
    const allowlist =
      this.configService.get<string[]>('emailPolicy.allowlist') ?? [];

    const decision = evaluateEmailDomain(email, {
      enabled: enabled !== false,
      allowlist,
    });

    if (decision.allowed) return;

    this.logReject(email, decision.ruleId);
    throw new BadRequestException(EMAIL_POLICY_REJECT_MESSAGE);
  }

  private logReject(email: string, ruleId: EmailPolicyRuleId): void {
    const normalized = normalizeEmailAddress(email);
    const emailHash = createHash('sha256')
      .update(normalized)
      .digest('hex')
      .slice(0, 16);
    this.logger.warn(
      `email_policy_reject ruleId=${ruleId} emailHash=${emailHash}`,
    );
  }
}
