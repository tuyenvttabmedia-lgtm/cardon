export {
  EMAIL_POLICY_DISPOSABLE_DOMAINS,
  EMAIL_POLICY_REJECT_MESSAGE,
  EMAIL_POLICY_RESERVED_DOMAINS,
  type EmailPolicyRuleId,
} from './email-policy.constants';
export {
  domainMatchesListed,
  evaluateEmailDomain,
  extractEmailDomain,
  isEmailPolicyEnabled,
  normalizeEmailAddress,
  parseEmailDomainAllowlist,
  type EmailPolicyDecision,
  type EmailPolicyOptions,
} from './email-policy';
export { EmailPolicyModule } from './email-policy.module';
export { EmailPolicyService } from './email-policy.service';
