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
  agentStatus: string | null;
  kycStatus: string | null;
  accountType: string | null;
  gates: OnboardingGateFlags;
  banner: string | null;
  kycPath: string;
};
