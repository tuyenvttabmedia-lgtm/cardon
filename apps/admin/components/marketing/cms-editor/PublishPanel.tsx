'use client';

import { memo, useMemo } from 'react';
import { Button, Input, Label, Select } from '@/components/ui/Form';
import {
  fromDatetimeLocalValue,
  type CmsEditorFormState,
} from '@/lib/cms-editor-utils';
import type { CmsRevision } from '@/lib/cms-revisions';

export const PublishPanel = memo(function PublishPanel({
  form,
  setForm,
  authorLabel,
  revisions,
  onRestoreRevision,
  autosaveLabel,
  onSave,
  onPublish,
  onSchedule,
  saving,
}: {
  form: CmsEditorFormState;
  setForm: (fn: (prev: CmsEditorFormState) => CmsEditorFormState) => void;
  authorLabel: string;
  revisions: CmsRevision[];
  onRestoreRevision: (rev: CmsRevision) => void;
  autosaveLabel: string | null;
  onSave: () => void;
  onPublish: () => void;
  onSchedule: () => void;
  saving: boolean;
}) {
  const scheduleIso = useMemo(
    () => fromDatetimeLocalValue(form.scheduledPublishAt),
    [form.scheduledPublishAt],
  );
  const scheduleDate = scheduleIso ? new Date(scheduleIso) : null;
  const isFutureSchedule = !!(scheduleDate && scheduleDate.getTime() > Date.now());
  const scheduleLabel = scheduleDate
    ? scheduleDate.toLocaleString('vi-VN')
    : null;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label>Trạng thái</Label>
        <Select
          className="mt-1 text-sm"
          value={form.status}
          onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as 'DRAFT' | 'PUBLISHED' }))}
        >
          <option value="DRAFT">Bản nháp</option>
          <option value="PUBLISHED">Đã xuất bản</option>
        </Select>
      </div>

      <div>
        <Label>Lên lịch xuất bản</Label>
        <Input
          type="datetime-local"
          className="mt-1 text-sm"
          value={form.scheduledPublishAt}
          onChange={(e) =>
            setForm((p) => ({
              ...p,
              scheduledPublishAt: e.target.value,
              // Future schedule implies draft until cron publishes.
              status: e.target.value ? 'DRAFT' : p.status,
            }))
          }
        />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {form.scheduledPublishAt ? (
            <button
              type="button"
              className="text-xs font-medium text-rose-600 hover:underline"
              onClick={() => setForm((p) => ({ ...p, scheduledPublishAt: '' }))}
            >
              Xóa lịch
            </button>
          ) : null}
        </div>
        {isFutureSchedule ? (
          <p className="mt-1 text-xs text-amber-700">
            Bài ở trạng thái nháp và sẽ tự xuất bản lúc <strong>{scheduleLabel}</strong>.
          </p>
        ) : form.scheduledPublishAt && scheduleDate ? (
          <p className="mt-1 text-xs text-rose-600">
            Thời điểm đã qua — chọn giờ trong tương lai, hoặc bấm Xuất bản ngay.
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            Chọn ngày/giờ rồi bấm <strong>Lên lịch</strong>. Server sẽ tự xuất bản đúng giờ.
          </p>
        )}
      </div>

      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
        <p><span className="font-medium text-slate-800">Tác giả:</span> {authorLabel}</p>
        {autosaveLabel && <p className="text-emerald-600">{autosaveLabel}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Button onClick={onSave} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu nháp'}</Button>
        <Button
          variant="secondary"
          onClick={onSchedule}
          disabled={saving || !isFutureSchedule}
          title={!isFutureSchedule ? 'Chọn thời điểm trong tương lai trước' : undefined}
        >
          Lên lịch
        </Button>
        <Button variant="secondary" onClick={onPublish} disabled={saving}>
          Xuất bản ngay
        </Button>
      </div>

      {revisions.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Lịch sử phiên bản</p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
            {revisions.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="w-full rounded px-2 py-1 text-left hover:bg-slate-100"
                  onClick={() => onRestoreRevision(r)}
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});
