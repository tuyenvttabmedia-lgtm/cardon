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

/** Insert via ProseMirror view (drop/paste) and select so Alt panel opens. */
export function insertCmsImageIntoView(
  view: EditorView,
  attrs: { src: string; alt?: string | null },
) {
  const node = view.state.schema.nodes.image.create({
    src: attrs.src,
    alt: attrs.alt ?? '',
  });
  const tr = view.state.tr.replaceSelectionWith(node);
  view.dispatch(tr);
  selectImageNearCursor(view);
}

/** Insert image then NodeSelect it so the inline Alt panel opens immediately. */
export function insertCmsImage(
  editor: Editor,
  attrs: { src: string; alt?: string | null },
) {
  editor
    .chain()
    .focus()
    .insertContent({
      type: 'image',
      attrs: { src: attrs.src, alt: attrs.alt ?? '' },
    })
    .run();
  selectImageNearCursor(editor.view);
}
