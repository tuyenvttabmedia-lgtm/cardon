'use client';

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

/**
 * Click-to-edit image node: selected image shows an inline Alt Image panel
 * under the photo (WordPress/Notion-style), no media library round-trip.
 */
export function CmsImageNodeView({ node, updateAttributes, selected }: NodeViewProps) {
  const alt = String(node.attrs.alt ?? '');
  const src = String(node.attrs.src ?? '');

  return (
    <NodeViewWrapper
      as="figure"
      className={`cms-editor-image my-4 ${selected ? 'cms-editor-image--selected' : ''}`}
      data-drag-handle
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className={`mx-auto block max-h-[480px] w-auto max-w-full rounded-lg object-contain ${
          selected ? 'ring-2 ring-admin-500 ring-offset-2' : ''
        }`}
      />

      {selected ? (
        <div
          className="mx-auto mt-3 max-w-xl rounded-xl border border-admin-200 bg-white p-3 shadow-md"
          contentEditable={false}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <label className="mb-1 block text-xs font-semibold text-slate-700">
            Alt Image — Thêm alt cho ảnh
          </label>
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-admin-500 focus:ring-1 focus:ring-admin-300"
            value={alt}
            placeholder="Mô tả nội dung ảnh (SEO / accessibility)"
            onChange={(e) => updateAttributes({ alt: e.target.value })}
          />
          <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
            Nhập alt ngay tại đây — không cần quay lại thư viện ảnh.
          </p>
        </div>
      ) : (
        <figcaption
          className={`mt-1.5 text-center text-xs ${
            alt ? 'text-slate-400' : 'font-medium text-amber-600'
          }`}
          contentEditable={false}
        >
          {alt ? `Alt: ${alt}` : 'Chưa có alt — nhấn vào ảnh để thêm'}
        </figcaption>
      )}
    </NodeViewWrapper>
  );
}
