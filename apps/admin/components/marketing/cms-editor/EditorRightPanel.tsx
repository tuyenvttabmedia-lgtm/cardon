'use client';

import { memo } from 'react';
import { PublishPanel } from './PublishPanel';
import { SeoPanel } from './SeoPanel';
import { StatisticsPanel } from './StatisticsPanel';
import { PanelCard } from './FeaturedImageField';
import type { CmsEditorFormState } from '@/lib/cms-editor-utils';
import type { CmsRevision } from '@/lib/cms-revisions';

export const EditorRightPanel = memo(function EditorRightPanel({
  form,
  setForm,
  previewPath,
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
  previewPath: string;
  authorLabel: string;
  revisions: CmsRevision[];
  onRestoreRevision: (rev: CmsRevision) => void;
  autosaveLabel: string | null;
  onSave: () => void;
  onPublish: () => void;
  onSchedule: () => void;
  saving: boolean;
}) {
  return (
    <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-200 bg-slate-50/50 p-3 lg:w-96">
      <PanelCard title="Publish">
        <PublishPanel
          form={form}
          setForm={setForm}
          authorLabel={authorLabel}
          revisions={revisions}
          onRestoreRevision={onRestoreRevision}
          autosaveLabel={autosaveLabel}
          onSave={onSave}
          onPublish={onPublish}
          onSchedule={onSchedule}
          saving={saving}
        />
      </PanelCard>
      <PanelCard title="SEO">
        <SeoPanel form={form} setForm={setForm} previewPath={previewPath} compact />
      </PanelCard>
      <PanelCard title="Statistics" defaultOpen={false}>
        <StatisticsPanel content={form.content} />
      </PanelCard>
    </aside>
  );
});
