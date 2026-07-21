'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, statusToBadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Label } from '@/components/ui/Input';
import { useAgentProfile } from '@/hooks/useAuth';
import { agentApi, ApiClientError } from '@/services/api-client';
import { formatDateTime, kycStatusLabel } from '@/lib/utils';
import {
  ACCOUNT_TYPE_LABELS,
  INTEREST_OPTIONS,
  LANGUAGE_OPTIONS,
  VOLUME_OPTIONS,
  type AgentAccountType,
  type AgentKycDetail,
  type KycInterest,
  type KycLanguage,
  type KycVolume,
} from '@/types/kyc';
import { EmailVerificationBanner } from '@/components/platform/EmailVerificationBanner';
import { useOnboarding } from '@/contexts/OnboardingContext';

type DocUploadState = Record<string, { storageKey: string; filename: string }>;

const EMPTY_DOCS: DocUploadState = {};

function FieldRow({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function DocumentUploadField({
  field,
  label,
  required,
  value,
  onUpload,
  uploading,
  disabled,
}: {
  field: string;
  label: string;
  required?: boolean;
  value?: { storageKey: string; filename: string };
  onUpload: (field: string, file: File) => Promise<void>;
  uploading: string | null;
  disabled?: boolean;
}) {
  return (
    <FieldRow label={label} required={required}>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled || uploading === field}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onUpload(field, file);
            e.target.value = '';
          }}
        />
        {uploading === field && <span className="text-xs text-slate-500">Đang tải lên…</span>}
        {value && (
          <span className="text-xs text-emerald-700">
            ✓ {value.filename}
          </span>
        )}
      </div>
    </FieldRow>
  );
}

const DOC_FIELD_LABELS: Record<string, string> = {
  selfie: 'Ảnh chân dung',
  cccdFront: 'CCCD mặt trước',
  cccdBack: 'CCCD mặt sau',
  citizenId: 'CCCD',
  businessLicense: 'Giấy phép / ĐKKD',
  businessRegistration: 'Giấy đăng ký kinh doanh',
  authorizationLetter: 'Giấy ủy quyền',
};

const PROFILE_FIELD_LABELS: Record<string, string> = {
  fullName: 'Họ và tên',
  dob: 'Ngày sinh',
  email: 'Email',
  phone: 'Số điện thoại',
  address: 'Địa chỉ',
  cccd: 'Số CCCD',
  cccdIssueDate: 'Ngày cấp CCCD',
  cccdIssuePlace: 'Nơi cấp CCCD',
};

function KycDocumentPreview({
  field,
  storageKey,
}: {
  field: string;
  storageKey: string;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = DOC_FIELD_LABELS[field] ?? field;

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  async function openPreview() {
    setOpen(true);
    setError(null);
    if (url) return;
    setLoading(true);
    try {
      const blob = await agentApi.fetchKycDocumentBlob(storageKey);
      setUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Không mở được ảnh');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void openPreview()}
        className="rounded border border-slate-200 px-2 py-1 text-xs text-blue-700 hover:bg-slate-50"
      >
        {label}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-semibold text-slate-900">{label}</p>
              <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
                Đóng
              </Button>
            </div>
            {loading && <p className="text-sm text-slate-500">Đang tải ảnh…</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
            {url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={label} className="mx-auto max-h-[75vh] w-auto rounded-lg object-contain" />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ProfileSummary({ kyc }: { kyc: AgentKycDetail }) {
  const profile = kyc.profile ?? {};
  const docs = kyc.documents ?? {};
  const business = kyc.businessProfile ?? {};
  const type = (kyc.accountType as AgentAccountType) ?? 'COMPANY';

  return (
    <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-slate-500">Loại tài khoản</dt>
        <dd className="font-medium">{ACCOUNT_TYPE_LABELS[type] ?? type}</dd>
      </div>
      {Object.entries(profile).map(([key, val]) => (
        <div key={key}>
          <dt className="text-slate-500">{PROFILE_FIELD_LABELS[key] ?? key}</dt>
          <dd className="font-medium">{String(val ?? '—')}</dd>
        </div>
      ))}
      {Object.keys(docs).length > 0 && (
        <div className="sm:col-span-2">
          <dt className="mb-2 text-slate-500">Tài liệu đính kèm</dt>
          <dd className="flex flex-wrap gap-2">
            {Object.entries(docs).map(([field, key]) => (
              <KycDocumentPreview key={field} field={field} storageKey={key} />
            ))}
          </dd>
        </div>
      )}
      {Array.isArray(business.interests) && (
        <div className="sm:col-span-2">
          <dt className="text-slate-500">Lĩnh vực quan tâm</dt>
          <dd className="font-medium">{(business.interests as string[]).join(', ')}</dd>
        </div>
      )}
      {business.expectedVolume != null && (
        <div>
          <dt className="text-slate-500">Doanh số dự kiến</dt>
          <dd className="font-medium">{String(business.expectedVolume)}</dd>
        </div>
      )}
    </dl>
  );
}

export default function KycPanel() {
  const { profile, loading: profileLoading, error: profileError, refresh } = useAgentProfile();
  const { status: onboardingStatus } = useOnboarding();
  const emailVerified = onboardingStatus?.emailVerified ?? false;
  const [kyc, setKyc] = useState<AgentKycDetail | null>(null);
  const [kycLoading, setKycLoading] = useState(true);
  const [accountType, setAccountType] = useState<AgentAccountType>('COMPANY');
  const [profileFields, setProfileFields] = useState<Record<string, string>>({});
  const [documents, setDocuments] = useState<DocUploadState>(EMPTY_DOCS);
  const [interests, setInterests] = useState<KycInterest[]>([]);
  const [expectedVolume, setExpectedVolume] = useState<KycVolume>('100-500');
  const [hasExistingSystem, setHasExistingSystem] = useState(false);
  const [languages, setLanguages] = useState<KycLanguage[]>([]);
  const [agreements, setAgreements] = useState({
    terms: false,
    privacy: false,
    legalCommitment: false,
  });
  const [uploading, setUploading] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const loadKyc = useCallback(async () => {
    setKycLoading(true);
    try {
      const data = await agentApi.getKyc();
      setKyc(data);
      if (data.accountType && ['PERSONAL', 'HOUSEHOLD', 'COMPANY'].includes(data.accountType)) {
        setAccountType(data.accountType as AgentAccountType);
      }
      if (data.profile) {
        const pf: Record<string, string> = {};
        for (const [k, v] of Object.entries(data.profile)) {
          pf[k] = String(v ?? '');
        }
        setProfileFields(pf);
      }
      if (data.documents) {
        const docState: DocUploadState = {};
        for (const [field, key] of Object.entries(data.documents)) {
          docState[field] = { storageKey: key, filename: field };
        }
        setDocuments(docState);
      }
      const bp = data.businessProfile ?? {};
      if (Array.isArray(bp.interests)) setInterests(bp.interests as KycInterest[]);
      if (typeof bp.expectedVolume === 'string') setExpectedVolume(bp.expectedVolume as KycVolume);
      if (typeof bp.hasExistingSystem === 'boolean') setHasExistingSystem(bp.hasExistingSystem);
      if (Array.isArray(bp.programmingLanguages)) setLanguages(bp.programmingLanguages as KycLanguage[]);
    } catch {
      setKyc(null);
    } finally {
      setKycLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKyc();
  }, [loadKyc]);

  const kycStatus = kyc?.status ?? profile?.kyc?.status ?? 'PENDING';

  const canSubmit = useMemo(() => {
    if (!profile) return false;
    if (kycStatus === 'SUBMITTED' || kycStatus === 'APPROVED') return false;
    return (
      profile.status === 'PENDING_KYC' ||
      profile.status === 'REJECTED' ||
      kycStatus === 'NEED_MORE_INFO' ||
      kycStatus === 'PENDING'
    );
  }, [profile, kycStatus]);

  async function handleUpload(field: string, file: File) {
    setUploading(field);
    setSubmitError(null);
    try {
      const stored = await agentApi.uploadKycDocument(file, field);
      setDocuments((prev) => ({
        ...prev,
        [field]: { storageKey: stored.storageKey, filename: stored.filename },
      }));
    } catch (err) {
      setSubmitError(err instanceof ApiClientError ? err.message : 'Upload thất bại');
    } finally {
      setUploading(null);
    }
  }

  function setProfile(key: string, value: string) {
    setProfileFields((prev) => ({ ...prev, [key]: value }));
  }

  function toggleInterest(value: KycInterest) {
    setInterests((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  function toggleLanguage(value: KycLanguage) {
    setLanguages((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emailVerified) {
      setSubmitError('Vui lòng xác minh email trước khi nộp hồ sơ KYC.');
      return;
    }
    if (!agreements.terms || !agreements.privacy || !agreements.legalCommitment) {
      setSubmitError('Vui lòng đồng ý các điều khoản bắt buộc.');
      return;
    }

    const docPayload: Record<string, string> = {};
    for (const [field, meta] of Object.entries(documents)) {
      docPayload[field] = meta.storageKey;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    try {
      await agentApi.submitKyc({
        accountType,
        profile: profileFields,
        documents: docPayload,
        businessProfile: {
          interests,
          expectedVolume,
          hasExistingSystem,
          programmingLanguages: languages,
          acceptTerms: agreements.terms,
          acceptPrivacy: agreements.privacy,
          acceptLegalCommitment: agreements.legalCommitment,
        },
      });
      setSubmitSuccess(true);
      await refresh();
      await loadKyc();
    } catch (err) {
      setSubmitError(err instanceof ApiClientError ? err.message : 'Gửi KYC thất bại');
    } finally {
      setSubmitting(false);
    }
  }

  if (profileLoading || kycLoading) {
    return <p className="text-slate-500">Đang tải hồ sơ KYC…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Trung tâm KYC</h1>
        <p className="text-slate-600">
          Xác minh email và hoàn tất hồ sơ để kích hoạt tài khoản đại lý
        </p>
      </div>

      <EmailVerificationBanner />

      {profileError && <p className="text-red-600">{profileError}</p>}

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-500">Trạng thái KYC:</span>
          <Badge tone={statusToBadgeTone(kycStatus === 'SUBMITTED' ? 'PENDING' : kycStatus)}>
            {kycStatusLabel(kycStatus)}
          </Badge>
          {kyc?.reviewedAt && (
            <span className="text-xs text-slate-400">
              Cập nhật lúc {formatDateTime(kyc.reviewedAt)}
            </span>
          )}
        </div>

        {kycStatus === 'NEED_MORE_INFO' && kyc?.reviewNote && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">Yêu cầu bổ sung từ CardOn:</p>
            <p className="mt-1">{kyc.reviewNote}</p>
          </div>
        )}

        {kyc && kycStatus !== 'PENDING' && !canSubmit && <ProfileSummary kyc={kyc} />}
      </Card>

      {canSubmit && (
        <Card>
          <h2 className="font-semibold">Nộp hồ sơ KYC</h2>
          <p className="mt-1 text-sm text-slate-500">
            Chọn loại tài khoản và điền đầy đủ thông tin. Tài liệu upload tối đa 10MB (JPG, PNG, WebP).
          </p>

          <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
            <FieldRow label="Loại tài khoản" required>
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as AgentAccountType)}
              >
                {(Object.keys(ACCOUNT_TYPE_LABELS) as AgentAccountType[]).map((t) => (
                  <option key={t} value={t}>
                    {ACCOUNT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </FieldRow>

            {accountType === 'PERSONAL' && (
              <div className="space-y-4">
                <FieldRow label="Họ và tên" required>
                  <Input value={profileFields.fullName ?? ''} onChange={(e) => setProfile('fullName', e.target.value)} required />
                </FieldRow>
                <FieldRow label="Ngày sinh" required>
                  <Input type="date" value={profileFields.dob ?? ''} onChange={(e) => setProfile('dob', e.target.value)} required />
                </FieldRow>
                <FieldRow label="Số CCCD/CMND" required>
                  <Input value={profileFields.cccd ?? ''} onChange={(e) => setProfile('cccd', e.target.value)} required />
                </FieldRow>
                <FieldRow label="Ngày cấp CCCD" required>
                  <Input type="date" value={profileFields.cccdIssueDate ?? ''} onChange={(e) => setProfile('cccdIssueDate', e.target.value)} required />
                </FieldRow>
                <FieldRow label="Nơi cấp CCCD" required>
                  <Input value={profileFields.cccdIssuePlace ?? ''} onChange={(e) => setProfile('cccdIssuePlace', e.target.value)} required />
                </FieldRow>
                <FieldRow label="Email" required>
                  <Input type="email" value={profileFields.email ?? ''} onChange={(e) => setProfile('email', e.target.value)} required />
                </FieldRow>
                <FieldRow label="Số điện thoại" required>
                  <Input value={profileFields.phone ?? ''} onChange={(e) => setProfile('phone', e.target.value)} required />
                </FieldRow>
                <FieldRow label="Địa chỉ thường trú" required>
                  <Input value={profileFields.address ?? ''} onChange={(e) => setProfile('address', e.target.value)} required />
                </FieldRow>
                <DocumentUploadField field="cccdFront" label="CCCD mặt trước" required value={documents.cccdFront} onUpload={handleUpload} uploading={uploading} />
                <DocumentUploadField field="cccdBack" label="CCCD mặt sau" required value={documents.cccdBack} onUpload={handleUpload} uploading={uploading} />
                <DocumentUploadField field="selfie" label="Ảnh chân dung (tuỳ chọn)" value={documents.selfie} onUpload={handleUpload} uploading={uploading} />
              </div>
            )}

            {accountType === 'HOUSEHOLD' && (
              <div className="space-y-4">
                <FieldRow label="Tên hộ kinh doanh" required>
                  <Input value={profileFields.businessName ?? ''} onChange={(e) => setProfile('businessName', e.target.value)} required />
                </FieldRow>
                <FieldRow label="Mã số hộ kinh doanh" required>
                  <Input value={profileFields.householdTaxCode ?? ''} onChange={(e) => setProfile('householdTaxCode', e.target.value)} required />
                </FieldRow>
                <FieldRow label="Chủ hộ" required>
                  <Input value={profileFields.ownerName ?? ''} onChange={(e) => setProfile('ownerName', e.target.value)} required />
                </FieldRow>
                <FieldRow label="Số CCCD chủ hộ" required>
                  <Input value={profileFields.cccd ?? ''} onChange={(e) => setProfile('cccd', e.target.value)} required />
                </FieldRow>
                <FieldRow label="Email" required>
                  <Input type="email" value={profileFields.email ?? ''} onChange={(e) => setProfile('email', e.target.value)} required />
                </FieldRow>
                <FieldRow label="Số điện thoại" required>
                  <Input value={profileFields.phone ?? ''} onChange={(e) => setProfile('phone', e.target.value)} required />
                </FieldRow>
                <FieldRow label="Địa chỉ kinh doanh" required>
                  <Input value={profileFields.address ?? ''} onChange={(e) => setProfile('address', e.target.value)} required />
                </FieldRow>
                <DocumentUploadField field="businessLicense" label="Giấy phép / đăng ký hộ kinh doanh" required value={documents.businessLicense} onUpload={handleUpload} uploading={uploading} />
                <DocumentUploadField field="citizenId" label="CCCD chủ hộ" required value={documents.citizenId} onUpload={handleUpload} uploading={uploading} />
              </div>
            )}

            {accountType === 'COMPANY' && (
              <div className="space-y-4">
                <FieldRow label="Tên công ty" required>
                  <Input value={profileFields.companyName ?? ''} onChange={(e) => setProfile('companyName', e.target.value)} required />
                </FieldRow>
                <FieldRow label="Mã số thuế" required>
                  <Input value={profileFields.taxCode ?? ''} onChange={(e) => setProfile('taxCode', e.target.value)} required />
                </FieldRow>
                <FieldRow label="Người đại diện" required>
                  <Input value={profileFields.representative ?? ''} onChange={(e) => setProfile('representative', e.target.value)} required />
                </FieldRow>
                <FieldRow label="Chức vụ" required>
                  <Input value={profileFields.position ?? ''} onChange={(e) => setProfile('position', e.target.value)} required />
                </FieldRow>
                <FieldRow label="Email" required>
                  <Input type="email" value={profileFields.email ?? ''} onChange={(e) => setProfile('email', e.target.value)} required />
                </FieldRow>
                <FieldRow label="Số điện thoại" required>
                  <Input value={profileFields.phone ?? ''} onChange={(e) => setProfile('phone', e.target.value)} required />
                </FieldRow>
                <FieldRow label="Website">
                  <Input value={profileFields.website ?? ''} onChange={(e) => setProfile('website', e.target.value)} />
                </FieldRow>
                <FieldRow label="Địa chỉ trụ sở" required>
                  <Input value={profileFields.address ?? ''} onChange={(e) => setProfile('address', e.target.value)} required />
                </FieldRow>
                <DocumentUploadField field="businessRegistration" label="Giấy đăng ký kinh doanh" required value={documents.businessRegistration} onUpload={handleUpload} uploading={uploading} />
                <DocumentUploadField field="citizenId" label="CCCD người đại diện" required value={documents.citizenId} onUpload={handleUpload} uploading={uploading} />
                <DocumentUploadField field="authorizationLetter" label="Giấy ủy quyền (nếu có)" value={documents.authorizationLetter} onUpload={handleUpload} uploading={uploading} />
              </div>
            )}

            <div className="space-y-4 border-t border-slate-100 pt-4">
              <h3 className="font-medium text-slate-800">Thông tin kinh doanh</h3>
              <div>
                <Label>Lĩnh vực quan tâm</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {INTEREST_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={interests.includes(opt.value)}
                        onChange={() => toggleInterest(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
              <FieldRow label="Doanh số dự kiến" required>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={expectedVolume}
                  onChange={(e) => setExpectedVolume(e.target.value as KycVolume)}
                >
                  {VOLUME_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </FieldRow>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hasExistingSystem}
                  onChange={(e) => setHasExistingSystem(e.target.checked)}
                />
                Đã có hệ thống bán hàng / tích hợp API
              </label>
              <div>
                <Label>Ngôn ngữ lập trình (nếu có)</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={languages.includes(opt.value)}
                        onChange={() => toggleLanguage(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-4 text-sm">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={agreements.terms}
                  onChange={(e) => setAgreements((a) => ({ ...a, terms: e.target.checked }))}
                />
                Tôi đồng ý với Điều khoản dịch vụ đại lý CardOn
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={agreements.privacy}
                  onChange={(e) => setAgreements((a) => ({ ...a, privacy: e.target.checked }))}
                />
                Tôi đồng ý với Chính sách bảo mật và xử lý dữ liệu cá nhân
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={agreements.legalCommitment}
                  onChange={(e) => setAgreements((a) => ({ ...a, legalCommitment: e.target.checked }))}
                />
                Tôi cam kết thông tin KYC là chính xác và chịu trách nhiệm pháp lý
              </label>
            </div>

            {submitError && <p className="text-sm text-red-600">{submitError}</p>}
            {submitSuccess && <p className="text-sm text-emerald-700">Đã gửi KYC thành công. CardOn sẽ xem xét trong 1–3 ngày làm việc.</p>}
            {!emailVerified && (
              <p className="text-sm text-amber-800">
                Nộp hồ sơ sẽ khả dụng sau khi bạn xác minh email (xem hướng dẫn ở trên).
              </p>
            )}
            <Button type="submit" disabled={submitting || !emailVerified}>
              {submitting ? 'Đang gửi…' : 'Gửi hồ sơ KYC'}
            </Button>
          </form>
        </Card>
      )}

      {kycStatus === 'APPROVED' && (
        <Card className="border-emerald-200 bg-emerald-50">
          <p className="font-medium text-emerald-800">KYC đã được duyệt. Tài khoản đại lý đã kích hoạt.</p>
        </Card>
      )}

      {kycStatus === 'REJECTED' && (
        <Card className="border-red-200 bg-red-50">
          <p className="font-medium text-red-800">KYC bị từ chối. Vui lòng cập nhật hồ sơ và nộp lại.</p>
        </Card>
      )}
    </div>
  );
}
