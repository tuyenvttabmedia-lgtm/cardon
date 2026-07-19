export type AgentAccountType = 'PERSONAL' | 'HOUSEHOLD' | 'COMPANY';

export type KycInterest = 'GAME_CARD' | 'PHONE_CARD' | 'TOPUP' | 'DATA';
export type KycVolume = '<100' | '100-500' | '500-2000' | '>2000';
export type KycLanguage = 'PHP' | 'NODEJS' | 'DOTNET' | 'JAVA' | 'PYTHON' | 'OTHER';

export type KycStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'NEED_MORE_INFO';

export interface KycDocumentRef {
  field: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface AgentKycDetail {
  status: KycStatus;
  accountType: AgentAccountType | string | null;
  profile: Record<string, unknown> | null;
  documents: Record<string, string> | null;
  businessProfile: Record<string, unknown> | null;
  reviewNote: string | null;
  requestedFields: string[] | null;
  reviewedAt: string | null;
  legacy: {
    companyName: string;
    taxCode: string;
    representativeName: string;
    documentFront: string;
    documentBack: string;
    businessLicense: string;
  } | null;
}

export interface SubmitKycPayload {
  accountType: AgentAccountType;
  profile: Record<string, unknown>;
  documents: Record<string, string>;
  businessProfile: Record<string, unknown>;
}

export const ACCOUNT_TYPE_LABELS: Record<AgentAccountType, string> = {
  PERSONAL: 'Cá nhân',
  HOUSEHOLD: 'Hộ kinh doanh',
  COMPANY: 'Doanh nghiệp',
};

export const INTEREST_OPTIONS: { value: KycInterest; label: string }[] = [
  { value: 'GAME_CARD', label: 'Thẻ game' },
  { value: 'PHONE_CARD', label: 'Thẻ điện thoại' },
  { value: 'TOPUP', label: 'Nạp tiền / Topup' },
  { value: 'DATA', label: 'Gói data' },
];

export const VOLUME_OPTIONS: { value: KycVolume; label: string }[] = [
  { value: '<100', label: 'Dưới 100 triệu/tháng' },
  { value: '100-500', label: '100 – 500 triệu/tháng' },
  { value: '500-2000', label: '500 – 2.000 triệu/tháng' },
  { value: '>2000', label: 'Trên 2.000 triệu/tháng' },
];

export const LANGUAGE_OPTIONS: { value: KycLanguage; label: string }[] = [
  { value: 'PHP', label: 'PHP' },
  { value: 'NODEJS', label: 'Node.js' },
  { value: 'DOTNET', label: '.NET' },
  { value: 'JAVA', label: 'Java' },
  { value: 'PYTHON', label: 'Python' },
  { value: 'OTHER', label: 'Khác' },
];
