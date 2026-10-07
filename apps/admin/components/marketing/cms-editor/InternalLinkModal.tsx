'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button, Input, Label } from '@/components/ui/Form';

export interface LinkTarget {
  label: string;
  href: string;
  type: string;
}

/** Accepts a pasted URL or an internal path. Rejects scriptable schemes. */
export function normalizeLinkHref(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^(javascript|data|vbscript):/i.test(value)) return null;
  if (/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(value)) return `https://${value}`;
  if (/^[\w./?&=%#_-]+$/.test(value)) return value.startsWith('/') ? value : `/${value}`;
  return null;
}

export function InternalLinkModal({
  open,
  onClose,
  targets,
  initialHref = '',
  onApply,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  targets: LinkTarget[];
  initialHref?: string;
  onApply: (href: string) => void;
  onRemove?: () => void;
}) {
  const [url, setUrl] = useState(initialHref);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setUrl(initialHref);
    setQ('');
    setError(null);
  }, [open, initialHref]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return targets.slice(0, 12);
    return targets
      .filter((t) => t.label.toLowerCase().includes(query) || t.href.toLowerCase().includes(query))
      .slice(0, 12);
  }, [targets, q]);

  function applyRaw(raw: string) {
    const href = normalizeLinkHref(raw);
    if (!href) {
      setError('Dán một URL (https://…) hoặc đường dẫn nội bộ (bắt đầu bằng /).');
      return;
    }
    onApply(href);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Chèn liên kết"
      description="Dán URL bất kỳ, hoặc chọn một trang có sẵn trên web."
      className="items-start pt-[12vh]"
      footer={
        <>
          {onRemove && initialHref ? (
            <Button type="button" variant="danger" className="mr-auto" onClick={onRemove}>
              Gỡ link
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="button" onClick={() => applyRaw(url)}>
            Áp dụng
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          applyRaw(url);
        }}
      >
        <Label htmlFor="cms-link-url">URL</Label>
        <Input
          id="cms-link-url"
          className="mt-1"
          placeholder="https:// hoặc /duong-dan"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
          autoFocus
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </form>

      <div className="mt-4 border-t border-slate-100 pt-4">
        <Label htmlFor="cms-link-search">Hoặc tìm trang trên web</Label>
        <Input
          id="cms-link-search"
          className="mt-1"
          placeholder="Tìm bài viết, trang, danh mục…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <ul className="mt-2 max-h-52 overflow-y-auto">
          {filtered.map((t) => (
            <li key={`${t.type}-${t.href}`}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => applyRaw(t.href)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{t.label}</span>
                  <span className="block truncate text-xs text-slate-400">{t.href}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">{t.type}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-4 text-center text-sm text-slate-500">Không tìm thấy trang phù hợp</li>
          )}
        </ul>
      </div>
    </Dialog>
  );
}
