'use client';

import Link from '@tiptap/extension-link';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect } from 'react';
import { Button } from '@/components/ui/Form';

interface Props {
  value: string;
  onChange: (html: string) => void;
}

export function FaqLiteEditor({ value, onChange }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        code: false,
        strike: false,
      }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
    ],
    content: value || '<p></p>',
    editorProps: {
      attributes: {
        class:
          'min-h-[160px] rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none prose prose-sm max-w-none',
      },
    },
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    const normalized = value || '<p></p>';
    const current = editor.getHTML();
    if (normalized !== current) {
      editor.commands.setContent(normalized, false);
    }
  }, [editor, value]);

  if (!editor) return null;

  function setLink() {
    const prev = editor!.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL liên kết', prev ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor!.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor!.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          size="sm"
          variant={editor.isActive('bold') ? 'primary' : 'secondary'}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </Button>
        <Button
          type="button"
          size="sm"
          variant={editor.isActive('italic') ? 'primary' : 'secondary'}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          I
        </Button>
        <Button
          type="button"
          size="sm"
          variant={editor.isActive('bulletList') ? 'primary' : 'secondary'}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          •
        </Button>
        <Button
          type="button"
          size="sm"
          variant={editor.isActive('orderedList') ? 'primary' : 'secondary'}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1.
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={setLink}>
          Link
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
