'use client';

import { memo, useMemo } from 'react';
import { Label, Select, Input } from '@/components/ui/Form';
import type { CmsCategory, CmsTag } from '@/types/api';
import type { CmsEditorFormState } from '@/lib/cms-editor-utils';
import {
  CMS_PAGE_LAYOUT_HINTS,
  CMS_PAGE_LAYOUT_LABELS,
  CMS_PAGE_LAYOUTS,
  defaultPageLayoutForSlug,
} from '@/lib/cms-page-layout';
import { FeaturedImageField } from './FeaturedImageField';
import { TagChipInput } from './TagChipInput';

function SidebarSection({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-zinc-600">
        <span className="text-base">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export const EditorMetaSidebar = memo(function EditorMetaSidebar({
  form,
  setForm,
  categories,
  tags,
  showTaxonomy,
  showPageNav,
  categoryCounts,
  onPickFeaturedImage,
  onCreateTag,
}: {
  form: CmsEditorFormState;
  setForm: (fn: (prev: CmsEditorFormState) => CmsEditorFormState) => void;
  categories: CmsCategory[];
  tags: CmsTag[];
  showTaxonomy: boolean;
  showPageNav?: boolean;
  categoryCounts: Record<string, number>;
  onPickFeaturedImage: () => void;
  onCreateTag?: (name: string) => void;
}) {
  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [categories],
  );

  return (
    <aside className="flex w-56 shrink-0 flex-col gap-3 overflow-y-auto border-r border-zinc-200 bg-zinc-50/80 p-3 md:w-64">
      {showTaxonomy && (
        <>
          <SidebarSection icon="📁" title="Danh mục">
            <Label className="sr-only">Danh mục</Label>
            <Select
              className="text-sm"
              value={form.categoryId}
              onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))}
            >
              <option value="">— Chọn danh mục —</option>
              {sortedCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({categoryCounts[c.id] ?? 0})
                </option>
              ))}
            </Select>
          </SidebarSection>

          <SidebarSection icon="🏷" title="Thẻ">
            <TagChipInput
              tags={tags}
              selectedIds={form.tagIds}
              onChange={(ids) => setForm((p) => ({ ...p, tagIds: ids }))}
              onCreateTag={onCreateTag}
            />
          </SidebarSection>
        </>
      )}

      {showPageNav && (
        <>
          <SidebarSection icon="🎨" title="Giao diện trang">
            <Label className="sr-only">Layout</Label>
            <Select
              className="text-sm"
              value={form.pageLayout}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  pageLayout: e.target.value as CmsEditorFormState['pageLayout'],
                }))
              }
            >
              {CMS_PAGE_LAYOUTS.map((layout) => (
                <option key={layout} value={layout}>
                  {CMS_PAGE_LAYOUT_LABELS[layout]}
                </option>
              ))}
            </Select>
            <p className="text-xs text-zinc-500">{CMS_PAGE_LAYOUT_HINTS[form.pageLayout]}</p>
            {form.pageLayout === 'LANDING' ? (
              <div className="space-y-1 pt-1">
                <Label className="text-xs text-zinc-600">Mô tả hero (excerpt)</Label>
                <Input
                  className="text-sm"
                  value={form.excerpt}
                  onChange={(e) => setForm((p) => ({ ...p, excerpt: e.target.value }))}
                  placeholder="Dòng mô tả dưới tiêu đề hero"
                />
              </div>
            ) : null}
          </SidebarSection>

          <SidebarSection icon="📋" title="Menu sidebar">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={form.showInNav}
              onChange={(e) => {
                const showInNav = e.target.checked;
                setForm((p) => ({
                  ...p,
                  showInNav,
                  pageLayout:
                    showInNav && p.pageLayout === 'ARTICLE'
                      ? 'POLICY'
                      : !showInNav &&
                          p.pageLayout === 'POLICY' &&
                          defaultPageLayoutForSlug(p.slug) !== 'POLICY'
                        ? 'ARTICLE'
                        : p.pageLayout,
                }));
              }}
              className="rounded border-zinc-300"
            />
            Hiển thị trong menu &quot;Trang thông tin&quot;
          </label>
          <p className="text-xs text-zinc-500">
            Thứ tự menu quản lý tại danh sách trang tĩnh. Trang trong menu dùng layout sidebar (Chính sách).
          </p>
        </SidebarSection>
        </>
      )}

      <SidebarSection icon="🖼" title="Ảnh đại diện">
        <FeaturedImageField
          value={form.featuredImage}
          onReplace={onPickFeaturedImage}
          onCrop={onPickFeaturedImage}
          onRemove={() => setForm((p) => ({ ...p, featuredImage: '' }))}
        />
      </SidebarSection>
    </aside>
  );
});
