import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import type { EditorView } from '@tiptap/pm/view';
import { NodeSelection } from '@tiptap/pm/state';
import { CmsImageNodeView } from './CmsImageNodeView';

export const CmsImage = Image.extend({
  name: 'image',
  selectable: true,
  draggable: true,
  addNodeView() {
    return ReactNodeViewRenderer(CmsImageNodeView);
  },
});

function selectImageNearCursor(view: EditorView) {
  const { state } = view;
  const $pos = state.selection.$from;
  const before = $pos.nodeBefore;
  if (before?.type.name === 'image') {
    const pos = $pos.pos - before.nodeSize;
    view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
    return;
  }

  let found: number | null = null;
  state.doc.nodesBetween(
    Math.max(0, state.selection.from - 3),
    Math.min(state.doc.content.size, state.selection.from + 3),
    (node, pos) => {
      if (node.type.name === 'image') found = pos;
    },
  );
  if (found != null) {
    view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, found)));
  }
}

export type CmsImageInsertAttrs = {
  /** TipTap image src — also accepts media picker `url`. */
  src?: string;
  url?: string;
  alt?: string | null;
};

function resolveImageSrc(attrs: CmsImageInsertAttrs): string {
  const src = (attrs.src ?? attrs.url ?? '').trim();
  if (!src) throw new Error('Image src/url is required');
  return src;
}

/** Insert via ProseMirror view (drop/paste) and select so Alt panel opens. */
export function insertCmsImageIntoView(view: EditorView, attrs: CmsImageInsertAttrs) {
  const node = view.state.schema.nodes.image.create({
    src: resolveImageSrc(attrs),
    alt: attrs.alt ?? '',
  });
  const tr = view.state.tr.replaceSelectionWith(node);
  view.dispatch(tr);
  selectImageNearCursor(view);
}

/** Insert image then NodeSelect it so the inline Alt panel opens immediately. */
export function insertCmsImage(editor: Editor, attrs: CmsImageInsertAttrs) {
  editor
    .chain()
    .focus()
    .insertContent({
      type: 'image',
      attrs: { src: resolveImageSrc(attrs), alt: attrs.alt ?? '' },
    })
    .run();
  selectImageNearCursor(editor.view);
}
