'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Blockquote from '@tiptap/extension-blockquote';
import Youtube from '@tiptap/extension-youtube';
import { useEffect } from 'react';

interface Props {
  value: string;
  onChange: (html: string) => void;
  onPickImage?: () => Promise<string | null>;
}

function ToolbarButton({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs font-medium ${
        active ? 'bg-admin-600 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
      }`}
    >
      {children}
    </button>
  );
}

export function ArticleEditor({ value, onChange, onPickImage }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Blockquote,
      Link.configure({ openOnClick: false }),
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Youtube.configure({ width: 640, height: 360 }),
    ],
    content: value || '<p></p>',
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
    editorProps: {
      attributes: {
        class:
          'cms-prose max-w-none min-h-[200px] rounded-b-lg border border-t-0 border-zinc-200 px-3 py-2 focus:outline-none',
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

  if (!editor) return null;

  async function insertImage() {
    const url = onPickImage ? await onPickImage() : window.prompt('URL ảnh');
    if (url) editor?.chain().focus().setImage({ src: url }).run();
  }

  function insertLink() {
    const url = window.prompt('URL liên kết');
    if (url) editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  function insertEmbed() {
    const url = window.prompt('URL YouTube hoặc iframe embed');
    if (!url) return;
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      editor?.chain().focus().setYoutubeVideo({ src: url }).run();
    } else {
      editor?.chain().focus().insertContent(`<iframe src="${url}" class="w-full aspect-video" allowfullscreen></iframe>`).run();
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1 rounded-t-lg border border-b-0 border-zinc-200 bg-zinc-50 p-2">
        <ToolbarButton
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          I
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          Quote
        </ToolbarButton>
        <ToolbarButton onClick={insertLink}>Link</ToolbarButton>
        <ToolbarButton onClick={() => void insertImage()}>Ảnh</ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        >
          Bảng
        </ToolbarButton>
        <ToolbarButton onClick={insertEmbed}>Embed</ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

import { buildPublicPageUrl } from '@/lib/public-url';

interface GooglePreviewProps {
  title: string;
  description: string;
  url: string;
}

export function GooglePreview({ title, description, url }: GooglePreviewProps) {
  const displayUrl = url || buildPublicPageUrl('/tin-tuc/danh-muc/...');
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-xs font-medium text-zinc-500">Xem trước Google</p>
      <p className="mt-2 truncate text-lg text-[#1a0dab]">{title || 'Tiêu đề SEO'}</p>
      <p className="truncate text-sm text-[#006621]">{displayUrl}</p>
      <p className="mt-1 line-clamp-2 text-sm text-zinc-600">
        {description || 'Mô tả SEO sẽ hiển thị tại đây.'}
      </p>
    </div>
  );
}
