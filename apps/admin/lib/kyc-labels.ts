export type AgentAccountType = 'PERSONAL' | 'HOUSEHOLD' | 'COMPANY';

export const ACCOUNT_TYPE_LABELS: Record<AgentAccountType, string> = {
  PERSONAL: 'Cá nhân',
  HOUSEHOLD: 'Hộ kinh doanh',
  COMPANY: 'Doanh nghiệp',
};

export const PROFILE_FIELD_LABELS: Record<string, string> = {
  fullName: 'Họ và tên',
  dob: 'Ngày sinh',
  cccd: 'Số CCCD/CMND',
  cccdIssueDate: 'Ngày cấp CCCD',
  cccdIssuePlace: 'Nơi cấp CCCD',
  email: 'Email liên hệ',
  phone: 'Số điện thoại',
  address: 'Địa chỉ',
  businessName: 'Tên hộ kinh doanh',
  householdTaxCode: 'Mã số hộ kinh doanh',
  ownerName: 'Chủ hộ',
  companyName: 'Tên doanh nghiệp',
  taxCode: 'Mã số thuế',
  representative: 'Người đại diện',
  position: 'Chức vụ',
  website: 'Website',
};

export const DOCUMENT_FIELD_LABELS: Record<string, string> = {
  cccdFront: 'CCCD mặt trước',
  cccdBack: 'CCCD mặt sau',
  selfie: 'Ảnh chân dung',
  businessLicense: 'Giấy phép kinh doanh',
  citizenId: 'CCCD/CMND',
  businessRegistration: 'Giấy đăng ký doanh nghiệp',
  authorizationLetter: 'Giấy ủy quyền',
  documentFront: 'Tài liệu mặt trước',
  documentBack: 'Tài liệu mặt sau',
};

export const INTEREST_LABELS: Record<string, string> = {
  GAME_CARD: 'Thẻ game',
  PHONE_CARD: 'Thẻ điện thoại',
  TOPUP: 'Nạp tiền / Topup',
  DATA: 'Gói data',
};

export const VOLUME_LABELS: Record<string, string> = {
  '<100': 'Dưới 100 triệu/tháng',
  '100-500': '100 – 500 triệu/tháng',
  '500-2000': '500 – 2.000 triệu/tháng',
  '>2000': 'Trên 2.000 triệu/tháng',
};

export const LANGUAGE_LABELS: Record<string, string> = {
  PHP: 'PHP',
  NODEJS: 'Node.js',
  DOTNET: '.NET',
  JAVA: 'Java',
  PYTHON: 'Python',
  OTHER: 'Khác',
};

/** Profile keys shown first per account type (others follow alphabetically). */
export const PROFILE_FIELD_ORDER: Record<AgentAccountType, string[]> = {
  PERSONAL: ['fullName', 'dob', 'cccd', 'cccdIssueDate', 'cccdIssuePlace', 'email', 'phone', 'address'],
  HOUSEHOLD: ['businessName', 'householdTaxCode', 'ownerName', 'cccd', 'email', 'phone', 'address'],
  COMPANY: ['companyName', 'taxCode', 'representative', 'position', 'email', 'phone', 'website', 'address'],
};

export function formatProfileValue(key: string, value: unknown): string {
  if (value == null || value === '') return '—';
  if (key === 'dob' || key === 'cccdIssueDate') {
    const s = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [y, m, d] = s.slice(0, 10).split('-');
      return `${d}/${m}/${y}`;
    }
  }
  return String(value);
}
