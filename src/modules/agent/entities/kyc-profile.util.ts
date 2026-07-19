import { AgentAccountType } from '@prisma/client';

export type KycLegacyFields = {
  companyName: string;
  taxCode: string;
  representativeName: string;
  documentFront: string;
  documentBack: string;
  businessLicense: string;
};

export function mapLegacyKycFields(
  accountType: AgentAccountType,
  profile: Record<string, unknown>,
  documents: Record<string, string>,
): KycLegacyFields {
  switch (accountType) {
    case AgentAccountType.PERSONAL:
      return {
        companyName: String(profile.fullName ?? ''),
        taxCode: String(profile.cccd ?? ''),
        representativeName: String(profile.fullName ?? ''),
        documentFront: documents.cccdFront ?? '',
        documentBack: documents.cccdBack ?? '',
        businessLicense: documents.selfie ?? documents.cccdFront ?? '',
      };
    case AgentAccountType.HOUSEHOLD:
      return {
        companyName: String(profile.businessName ?? ''),
        taxCode: String(profile.householdTaxCode ?? ''),
        representativeName: String(profile.ownerName ?? ''),
        documentFront: documents.citizenId ?? '',
        documentBack: documents.citizenId ?? '',
        businessLicense: documents.businessLicense ?? '',
      };
    case AgentAccountType.COMPANY:
    default:
      return {
        companyName: String(profile.companyName ?? ''),
        taxCode: String(profile.taxCode ?? ''),
        representativeName: String(profile.representative ?? ''),
        documentFront: documents.citizenId ?? '',
        documentBack: documents.citizenId ?? '',
        businessLicense: documents.businessRegistration ?? '',
      };
  }
}

export function resolveDisplayCompanyName(
  accountType: AgentAccountType | null | undefined,
  profile: Record<string, unknown> | null | undefined,
  fallback: string,
): string {
  if (!profile) return fallback;
  if (accountType === AgentAccountType.PERSONAL) {
    return String(profile.fullName ?? fallback);
  }
  if (accountType === AgentAccountType.HOUSEHOLD) {
    return String(profile.businessName ?? fallback);
  }
  return String(profile.companyName ?? fallback);
}
