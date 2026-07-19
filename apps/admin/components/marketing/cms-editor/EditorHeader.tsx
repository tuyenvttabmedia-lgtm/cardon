'use client';

import { Button, Input } from '@/components/ui/Form';
import { formatSavedAgo } from '@/lib/cms-revisions';
import type { SaveStatus } from '@/lib/cms-editor-utils';

export function EditorHeader({
  title,
  onTitleChange,
  onBack,
  saveStatus,
  lastSavedAt,
  onPreview,
  onSaveDraft,
  onPublish,
  saving,
}: {
  title: string;
  onTitleChange: (v: string) => void;
  onBack: () => void;
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  onPreview: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  saving: boolean;
}) {
  const ago = formatSavedAgo(lastSavedAt);

  return (
    <header className="flex shrink-0 flex-col gap-2 border-b border-zinc-200 bg-white px-3 py-2 md:flex-row md:items-center md:gap-4 md:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 text-sm font-medium text-zinc-600 hover:text-admin-600"
        >
          ← Quay lại danh sách
        </button>
        <Input
          className="min-w-0 flex-1 border-0 text-base font-semibold shadow-none focus:ring-0 md:text-lg"
          placeholder="Nhập tiêu đề bài viết..."
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 md:shrink-0">
        <SaveStatusIndicator status={saveStatus} ago={ago} />
        <Button variant="secondary" size="sm" onClick={onPreview}>Preview</Button>
        <Button variant="secondary" size="sm" onClick={onSaveDraft} disabled={saving}>Lưu nháp</Button>
        <Button size="sm" onClick={onPublish} disabled={saving}>Xuất bản</Button>
      </div>
    </header>
  );
}

function SaveStatusIndicator({ status, ago }: { status: SaveStatus; ago: string | null }) {
  if (status === 'saving') {
    return <span className="text-xs text-zinc-500">Đang lưu...</span>;
  }
  if (status === 'error') {
    return <span className="text-xs font-medium text-rose-600">Có lỗi</span>;
  }
  if (status === 'saved' && ago) {
    return <span className="text-xs text-emerald-600">Auto Saved {ago}</span>;
  }
  if (ago) {
    return <span className="text-xs text-zinc-400">Đã lưu {ago}</span>;
  }
  return null;
}
