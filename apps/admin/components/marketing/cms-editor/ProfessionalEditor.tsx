'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Youtube from '@tiptap/extension-youtube';
import Underline from '@tiptap/extension-underline';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Placeholder from '@tiptap/extension-placeholder';
import { cmsAdminApi } from '@/services/api-client';
import { InternalLinkModal } from './InternalLinkModal';
import {
  CMS_BLOCK_SNIPPETS,
  CMS_BLOCK_SNIPPET_LABELS,
  type CmsBlockSnippetKey,
} from '@/lib/cms-block-snippets';

type SlashKey =
  | 'heading'
  | 'image'
  | 'table'
  | 'youtube'
  | 'quote'
  | 'code'
  | 'button'
  | 'divider'
  | CmsBlockSnippetKey;

const LAYOUT_SLASH_ITEMS: Array<{ key: CmsBlockSnippetKey; icon: string }> = [
  { key: 'section', icon: '▢' },
  { key: 'mission-grid', icon: '▦' },
  { key: 'stats', icon: '📊' },
  { key: 'features', icon: '✦' },
  { key: 'cta', icon: '⬚' },
  { key: 'gioi-thieu-full', icon: '★' },
];

const SLASH_CATEGORIES = [
  {
    name: 'Basic',
    items: [
      { key: 'heading' as SlashKey, icon: 'H', label: 'Heading', desc: 'Tiêu đề H2' },
      { key: 'quote' as SlashKey, icon: '❝', label: 'Quote', desc: 'Trích dẫn' },
      { key: 'divider' as SlashKey, icon: '—', label: 'Divider', desc: 'Đường phân cách' },
    ],
  },
  {
    name: 'Media',
    items: [
      { key: 'image' as SlashKey, icon: '🖼', label: 'Image', desc: 'Chèn ảnh' },
      { key: 'youtube' as SlashKey, icon: '▶', label: 'Youtube', desc: 'Video YouTube' },
    ],
  },
  {
    name: 'Advanced',
    items: [
      { key: 'table' as SlashKey, icon: '⊞', label: 'Table', desc: 'Bảng 3×3' },
      { key: 'code' as SlashKey, icon: '<>', label: 'Code', desc: 'Khối mã' },
      { key: 'button' as SlashKey, icon: '⬚', label: 'Button', desc: 'Nút CTA' },
    ],
  },
];

const ALL_SLASH = SLASH_CATEGORIES.flatMap((c) => c.items);

function ToolbarBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-xs font-semibold transition ${
        active ? 'bg-admin-600 text-white' : 'text-zinc-600 hover:bg-zinc-200'
      }`}
    >
      {children}
    </button>
  );
}

export interface ProfessionalEditorProps {
  value: string;
  onChange: (html: string) => void;
  onPickImage?: () => Promise<string | null>;
  linkTargets?: Array<{ label: string; href: string; type: string }>;
  placeholder?: string;
  pageLayout?: 'ARTICLE' | 'LANDING' | 'POLICY';
}

function ProfessionalEditorInner({
  value,
  onChange,
  onPickImage,
  linkTargets = [],
  placeholder = "Bắt đầu viết hoặc nhập '/' để chèn block...",
  pageLayout = 'ARTICLE',
}: ProfessionalEditorProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [htmlMode, setHtmlMode] = useState(pageLayout === 'LANDING');
  const landingLocked = pageLayout === 'LANDING';
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (landingLocked && !htmlMode) {
      setHtmlMode(true);
    }
  }, [landingLocked, htmlMode]);

  async function uploadFile(file: File): Promise<string | null> {
    try {
      const media = await cmsAdminApi.uploadMedia(file, { folder: 'articles' });
      return media.url;
    } catch {
      return null;
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      HorizontalRule,
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false, allowBase64: false }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Youtube.configure({ width: 640, height: 360 }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '<p></p>',
    onUpdate: ({ editor: ed }) => {
      onChangeRef.current(ed.getHTML());
      const { from } = ed.state.selection;
      const textBefore = ed.state.doc.textBetween(Math.max(0, from - 20), from, '\n');
      const slashMatch = textBefore.match(/(?:^|\s)\/([^\s]*)$/);
      if (slashMatch) {
        setSlashOpen(true);
        setSlashFilter(slashMatch[1] ?? '');
      } else {
        setSlashOpen(false);
        setSlashFilter('');
      }
    },
    editorProps: {
      attributes: {
        class:
          'cms-prose max-w-none min-h-[480px] px-4 py-6 focus:outline-none',
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;
        const file = files[0];
        if (!file.type.startsWith('image/')) return false;
        event.preventDefault();
        void uploadFile(file).then((url) => {
          if (url) view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.nodes.image.create({ src: url })));
        });
        return true;
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (!file) continue;
            event.preventDefault();
            void uploadFile(file).then((url) => {
              if (url) view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.nodes.image.create({ src: url })));
            });
            return true;
          }
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current && value !== undefined) {
      editor.commands.setContent(value || '<p></p>', false);
    }
  }, [editor, value]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setLinkOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const pickAndInsertImage = useCallback(async () => {
    const url = onPickImage ? await onPickImage() : window.prompt('URL ảnh');
    if (url && editor) editor.chain().focus().setImage({ src: url }).run();
  }, [editor, onPickImage]);

  function removeSlashTrigger() {
    if (!editor) return;
    const { from } = editor.state.selection;
    const textBefore = editor.state.doc.textBetween(Math.max(0, from - 30), from, '\n');
    const match = textBefore.match(/(?:^|\s)\/([^\s]*)$/);
    if (match) {
      const len = match[0].length;
      editor.chain().focus().deleteRange({ from: from - len, to: from }).run();
    }
  }

  function insertLayoutBlock(key: CmsBlockSnippetKey) {
    const snippet = CMS_BLOCK_SNIPPETS[key];
    if (htmlMode) {
      onChangeRef.current(`${value || ''}\n${snippet}`.trim());
      return;
    }
    editor?.chain().focus().insertContent(`${snippet}<p></p>`).run();
  }

  function runSlash(key: SlashKey) {
    if (!editor && !htmlMode) return;
    removeSlashTrigger();
    setSlashOpen(false);

    if ((CMS_BLOCK_SNIPPETS as Record<string, string>)[key]) {
      insertLayoutBlock(key as CmsBlockSnippetKey);
      return;
    }

    if (!editor) return;
    switch (key) {
      case 'heading':
        editor.chain().focus().toggleHeading({ level: 2 }).run();
        break;
      case 'image':
        void pickAndInsertImage();
        break;
      case 'table':
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        break;
      case 'youtube': {
        const url = window.prompt('URL YouTube');
        if (url) editor.chain().focus().setYoutubeVideo({ src: url }).run();
        break;
      }
      case 'quote':
        editor.chain().focus().toggleBlockquote().run();
        break;
      case 'code':
        editor.chain().focus().toggleCodeBlock().run();
        break;
      case 'button':
        editor
          .chain()
          .focus()
          .insertContent(
            '<p><a href="#" class="inline-flex rounded-lg bg-admin-600 px-4 py-2 text-sm font-semibold text-white no-underline">Nút hành động</a></p>',
          )
          .run();
        break;
      case 'divider':
        editor.chain().focus().setHorizontalRule().run();
        break;
    }
  }

  const layoutCategory =
    pageLayout === 'LANDING'
      ? {
          name: 'Layout',
          items: LAYOUT_SLASH_ITEMS.map((item) => ({
            key: item.key as SlashKey,
            icon: item.icon,
            label: CMS_BLOCK_SNIPPET_LABELS[item.key].label,
            desc: CMS_BLOCK_SNIPPET_LABELS[item.key].desc,
          })),
        }
      : null;

  const filteredCategories = [...(layoutCategory ? [layoutCategory] : []), ...SLASH_CATEGORIES]
    .map((cat) => ({
      ...cat,
      items: cat.items.filter((i) =>
        i.label.toLowerCase().includes(slashFilter.toLowerCase()) ||
        i.desc.toLowerCase().includes(slashFilter.toLowerCase()),
      ),
    }))
    .filter((c) => c.items.length > 0);

  if (!editor && !htmlMode) return null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-100/50">
      <div className="sticky top-0 z-20 border-b border-zinc-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-[860px] flex-wrap items-center gap-0.5 px-2 py-1.5">
          {!htmlMode && editor ? (
            <>
              <ToolbarBtn title="H1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolbarBtn>
              <ToolbarBtn title="H2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarBtn>
              <ToolbarBtn title="H3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarBtn>
              <span className="mx-1 h-5 w-px bg-zinc-300" />
              <ToolbarBtn title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>B</ToolbarBtn>
              <ToolbarBtn title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>I</ToolbarBtn>
              <ToolbarBtn title="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>U</ToolbarBtn>
              <ToolbarBtn title="Strike" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>S</ToolbarBtn>
              <span className="mx-1 h-5 w-px bg-zinc-300" />
              <ToolbarBtn title="Bullet" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>•</ToolbarBtn>
              <ToolbarBtn title="Number" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</ToolbarBtn>
              <ToolbarBtn title="Quote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>&ldquo;</ToolbarBtn>
              <ToolbarBtn title="Code" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>{'<>'}</ToolbarBtn>
              <span className="mx-1 h-5 w-px bg-zinc-300" />
              <ToolbarBtn title="Table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>⊞</ToolbarBtn>
              <ToolbarBtn title="Link (Ctrl+K)" active={editor.isActive('link')} onClick={() => setLinkOpen(true)}>🔗</ToolbarBtn>
              <ToolbarBtn title="Image" onClick={() => void pickAndInsertImage()}>🖼</ToolbarBtn>
              <ToolbarBtn title="Youtube" onClick={() => { const u = window.prompt('URL YouTube'); if (u) editor.chain().focus().setYoutubeVideo({ src: u }).run(); }}>▶</ToolbarBtn>
              <ToolbarBtn title="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>—</ToolbarBtn>
              <span className="mx-1 h-5 w-px bg-zinc-300" />
              <ToolbarBtn title="Undo" onClick={() => editor.chain().focus().undo().run()}>↶</ToolbarBtn>
              <ToolbarBtn title="Redo" onClick={() => editor.chain().focus().redo().run()}>↷</ToolbarBtn>
              <span className="mx-1 h-5 w-px bg-zinc-300" />
            </>
          ) : (
            <span className="px-2 text-xs font-medium text-zinc-500">
              Chế độ HTML{landingLocked ? ' (bắt buộc cho Landing)' : ''}
            </span>
          )}
          {!landingLocked ? (
            <ToolbarBtn
              title="Chế độ HTML"
              active={htmlMode}
              onClick={() => setHtmlMode((v) => !v)}
            >
              {'</>'}
            </ToolbarBtn>
          ) : null}
          {landingLocked ? (
            <ToolbarBtn
              title="Khôi phục mẫu Giới thiệu đầy đủ"
              onClick={() => {
                if (
                  value.trim() &&
                  !window.confirm('Thay toàn bộ nội dung bằng mẫu Giới thiệu đầy đủ?')
                ) {
                  return;
                }
                onChangeRef.current(CMS_BLOCK_SNIPPETS['gioi-thieu-full']);
              }}
            >
              ★ Mẫu
            </ToolbarBtn>
          ) : null}
          {pageLayout === 'LANDING'
            ? LAYOUT_SLASH_ITEMS.slice(0, 3).map((item) => (
                <ToolbarBtn
                  key={item.key}
                  title={CMS_BLOCK_SNIPPET_LABELS[item.key].label}
                  onClick={() => insertLayoutBlock(item.key)}
                >
                  {item.icon}
                </ToolbarBtn>
              ))
            : null}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[860px] py-4">
          {htmlMode ? (
            <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
              <p className="text-xs text-zinc-500">
                Chế độ HTML — dùng class <code className="rounded bg-zinc-100 px-1">cms-block-*</code> cho layout landing.
                {landingLocked
                  ? ' Trang Landing chỉ chỉnh sửa bằng HTML để giữ layout block.'
                  : ' Gõ / trong ô visual để chèn block.'}
              </p>
              <textarea
                className="min-h-[520px] w-full rounded-lg border border-zinc-200 p-3 font-mono text-xs leading-relaxed outline-none focus:border-admin-500"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                spellCheck={false}
              />
              <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Xem trước</p>
                <div
                  className={`cms-prose max-w-none ${pageLayout === 'LANDING' ? 'cms-landing cms-landing-preview' : ''}`}
                  dangerouslySetInnerHTML={{ __html: value || '<p></p>' }}
                />
              </div>
            </div>
          ) : (
            <div className={`rounded-xl border border-zinc-200 bg-white shadow-sm ${pageLayout === 'LANDING' ? 'cms-landing-preview' : ''}`}>
              <EditorContent editor={editor} />
            </div>
          )}
        </div>

        {slashOpen && !htmlMode && filteredCategories.length > 0 && (
          <div className="absolute left-1/2 top-8 z-30 w-72 -translate-x-1/2 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl">
            <div className="border-b border-zinc-100 px-3 py-2">
              <input
                className="w-full rounded-md border border-zinc-200 px-2 py-1 text-sm outline-none focus:border-admin-500"
                placeholder="Tìm block…"
                value={slashFilter}
                onChange={(e) => setSlashFilter(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {filteredCategories.map((cat) => (
                <div key={cat.name}>
                  <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">{cat.name}</p>
                  {cat.items.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-admin-50"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        runSlash(item.key);
                      }}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-sm">{item.icon}</span>
                      <span>
                        <span className="block font-medium">{item.label}</span>
                        <span className="text-xs text-zinc-500">{item.desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <InternalLinkModal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        targets={linkTargets}
        onSelect={(href) => {
          editor?.chain().focus().extendMarkRange('link').setLink({ href }).run();
          setLinkOpen(false);
        }}
      />
    </div>
  );
}

export const ProfessionalEditor = memo(ProfessionalEditorInner);
