'use client';

import { memo } from 'react';
import { Button, Input, Label, Select } from '@/components/ui/Form';
import type { CmsEditorFormState } from '@/lib/cms-editor-utils';
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
  saving: boolean;
}) {
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
          onChange={(e) => setForm((p) => ({ ...p, scheduledPublishAt: e.target.value }))}
        />
      </div>

      <div className="rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600 space-y-1">
        <p><span className="font-medium text-zinc-800">Tác giả:</span> {authorLabel}</p>
        {autosaveLabel && <p className="text-emerald-600">{autosaveLabel}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Button onClick={onSave} disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu nháp'}</Button>
        <Button variant="secondary" onClick={onPublish} disabled={saving}>Xuất bản</Button>
      </div>

      {revisions.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Lịch sử phiên bản</p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
            {revisions.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="w-full rounded px-2 py-1 text-left hover:bg-zinc-100"
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
