'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Card, statusTone } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { formatDateTime } from '@/lib/utils';
import {
  ACCOUNT_TYPE_LABELS,
  DOCUMENT_FIELD_LABELS,
  formatProfileValue,
  INTEREST_LABELS,
  LANGUAGE_LABELS,
  PROFILE_FIELD_LABELS,
  PROFILE_FIELD_ORDER,
  VOLUME_LABELS,
  type AgentAccountType,
} from '@/lib/kyc-labels';
import { agentCenterApi } from '@/services/api-client';

type KycRecord = Record<string, unknown>;

type DocumentItem = {
  field: string;
  key: string;
  label: string;
};

function collectDocuments(kyc: KycRecord): DocumentItem[] {
  const docs = (kyc.documents ?? {}) as Record<string, string>;
  const items: DocumentItem[] = [];
  const seen = new Set<string>();

  for (const [field, key] of Object.entries(docs)) {
    if (key?.trim() && !seen.has(key)) {
      items.push({ field, key, label: DOCUMENT_FIELD_LABELS[field] ?? field });
      seen.add(key);
    }
  }

  const legacy: Array<{ field: string; raw: unknown }> = [
    { field: 'documentFront', raw: kyc.documentFront },
    { field: 'documentBack', raw: kyc.documentBack },
    { field: 'businessLicense', raw: kyc.businessLicense },
  ];
  for (const leg of legacy) {
    const key = String(leg.raw ?? '').trim();
    if (key && !seen.has(key)) {
      items.push({ field: leg.field, key, label: DOCUMENT_FIELD_LABELS[leg.field] ?? leg.field });
      seen.add(key);
    }
  }

  return items;
}

function orderedProfileEntries(
  accountType: AgentAccountType,
  profile: Record<string, unknown>,
): Array<[string, unknown]> {
  const order = PROFILE_FIELD_ORDER[accountType] ?? [];
  const entries: Array<[string, unknown]> = [];
  const used = new Set<string>();

  for (const key of order) {
    if (key in profile) {
      entries.push([key, profile[key]]);
      used.add(key);
    }
  }
  for (const [key, value] of Object.entries(profile)) {
    if (!used.has(key)) entries.push([key, value]);
  }
  return entries;
}

function KycDocumentViewer({
  agentId,
  doc,
  canView,
}: {
  agentId: string;
  doc: DocumentItem;
  canView: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setError(null);
  }, [previewUrl]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function handleView() {
    if (!canView) return;
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const url = await agentCenterApi.fetchKycDocumentBlob(agentId, doc.key);
      setPreviewUrl(url);
    } catch {
      setError('Không tải được tài liệu. Kiểm tra quyền duyệt KYC hoặc file đã bị xóa.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
        <p className="text-sm font-medium text-zinc-800">{doc.label}</p>
        <p className="mt-0.5 truncate text-xs text-zinc-400" title={doc.key}>
          {doc.key.split('/').pop()}
        </p>
        {canView ? (
          <Button size="sm" className="mt-2" variant="ghost" onClick={() => void handleView()}>
            Xem tài liệu
          </Button>
        ) : (
          <p className="mt-2 text-xs text-zinc-500">Cần quyền duyệt KYC để xem</p>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="font-semibold text-zinc-900">{doc.label}</h4>
              <Button size="sm" variant="ghost" onClick={close}>
                Đóng
              </Button>
            </div>
            {loading && <p className="text-sm text-zinc-500">Đang tải…</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
            {previewUrl && !loading && (
              <img
                src={previewUrl}
                alt={doc.label}
                className="mx-auto max-h-[70vh] w-auto rounded-lg border border-zinc-200"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function AgentKycReviewPanel({
  agentId,
  kyc,
  userPhone,
  emailVerified,
  canViewDocuments,
}: {
  agentId: string;
  kyc: KycRecord | null;
  userPhone?: string | null;
  emailVerified?: boolean | null;
  canViewDocuments: boolean;
}) {
  if (!kyc) {
    return (
      <Card className="p-4 text-sm text-zinc-500">
        Chưa có hồ sơ KYC. Đại lý chưa nộp thông tin xác minh.
      </Card>
    );
  }

  const accountType = (kyc.accountType as AgentAccountType) ?? 'COMPANY';
  const profile = (kyc.profile ?? {}) as Record<string, unknown>;
  const business = (kyc.businessProfile ?? {}) as Record<string, unknown>;
  const requestedFields = Array.isArray(kyc.requestedFields)
    ? (kyc.requestedFields as string[])
    : [];
  const documents = useMemo(() => collectDocuments(kyc), [kyc]);
  const profileEntries = useMemo(
    () => orderedProfileEntries(accountType, profile),
    [accountType, profile],
  );

  const interests = Array.isArray(business.interests)
    ? (business.interests as string[]).map((v) => INTEREST_LABELS[v] ?? v)
    : [];
  const languages = Array.isArray(business.programmingLanguages)
    ? (business.programmingLanguages as string[]).map((v) => LANGUAGE_LABELS[v] ?? v)
    : [];

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-semibold text-zinc-900">Hồ sơ KYC</h3>
          <Badge tone={statusTone(String(kyc.status))} status={String(kyc.status)} />
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700">
            {ACCOUNT_TYPE_LABELS[accountType] ?? accountType}
          </span>
        </div>

        {typeof kyc.reviewNote === 'string' && kyc.reviewNote.trim() && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-medium">Ghi chú duyệt / yêu cầu bổ sung</p>
            <p className="mt-1">{kyc.reviewNote}</p>
            {requestedFields.length > 0 && (
              <p className="mt-2 text-xs">
                Trường yêu cầu: {requestedFields.join(', ')}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-xs text-zinc-500">Email đã xác minh</p>
            <p className="font-medium">{emailVerified ? 'Có' : 'Chưa'}</p>
          </div>
          {userPhone && (
            <div>
              <p className="text-xs text-zinc-500">SĐT tài khoản</p>
              <p>{userPhone}</p>
            </div>
          )}
          {typeof kyc.reviewedAt === 'string' && kyc.reviewedAt && (
            <div>
              <p className="text-xs text-zinc-500">Cập nhật duyệt</p>
              <p>{formatDateTime(kyc.reviewedAt)}</p>
            </div>
          )}
        </div>
      </Card>

      {profileEntries.length > 0 && (
        <Card className="space-y-3">
          <h3 className="font-semibold">Thông tin định danh</h3>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {profileEntries.map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs text-zinc-500">{PROFILE_FIELD_LABELS[key] ?? key}</dt>
                <dd className="mt-0.5 font-medium text-zinc-900">{formatProfileValue(key, value)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {(interests.length > 0 || business.expectedVolume != null || languages.length > 0) && (
        <Card className="space-y-3">
          <h3 className="font-semibold">Thông tin kinh doanh</h3>
          <dl className="grid gap-3 sm:grid-cols-2">
            {interests.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-zinc-500">Lĩnh vực quan tâm</dt>
                <dd className="mt-0.5">{interests.join(', ')}</dd>
              </div>
            )}
            {business.expectedVolume != null && (
              <div>
                <dt className="text-xs text-zinc-500">Doanh số dự kiến</dt>
                <dd className="mt-0.5">
                  {VOLUME_LABELS[String(business.expectedVolume)] ?? String(business.expectedVolume)}
                </dd>
              </div>
            )}
            {typeof business.hasExistingSystem === 'boolean' && (
              <div>
                <dt className="text-xs text-zinc-500">Hệ thống bán hàng / API</dt>
                <dd className="mt-0.5">{business.hasExistingSystem ? 'Đã có' : 'Chưa có'}</dd>
              </div>
            )}
            {languages.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-xs text-zinc-500">Ngôn ngữ lập trình</dt>
                <dd className="mt-0.5">{languages.join(', ')}</dd>
              </div>
            )}
          </dl>
        </Card>
      )}

      <Card className="space-y-3">
        <div>
          <h3 className="font-semibold">Tài liệu đính kèm</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Tài liệu KYC được lưu bảo mật — chỉ admin có quyền duyệt KYC mới xem được.
          </p>
        </div>
        {documents.length === 0 ? (
          <p className="text-sm text-zinc-500">Chưa có tài liệu upload.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {documents.map((doc) => (
              <KycDocumentViewer
                key={`${doc.field}-${doc.key}`}
                agentId={agentId}
                doc={doc}
                canView={canViewDocuments}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
