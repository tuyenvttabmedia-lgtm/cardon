'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { vi } from '@/lib/i18n/vi';
import { ApiClientError } from '@/services/api-client';
import {
  contentAutomationApi,
  type CreateContentPlanInput,
} from '@/services/content-automation-api';
import type { ContentPlanListItem } from '@/types/api';

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'DRAFT', label: 'DRAFT' },
  { value: 'PLANNED', label: 'PLANNED' },
  { value: 'OUTLINE_READY', label: 'OUTLINE_READY' },
  { value: 'ARCHIVED', label: 'ARCHIVED' },
];

const CONTENT_TYPES = [
  { value: 'GUIDE', label: 'GUIDE' },
  { value: 'TUTORIAL', label: 'TUTORIAL' },
  { value: 'FAQ', label: 'FAQ' },
  { value: 'EXPLAINER', label: 'EXPLAINER' },
];

const SEARCH_INTENTS = [
  { value: 'INFORMATIONAL', label: 'INFORMATIONAL' },
  { value: 'COMMERCIAL', label: 'COMMERCIAL' },
  { value: 'TRANSACTIONAL', label: 'TRANSACTIONAL' },
];

const EMPTY_FORM: CreateContentPlanInput = {
  topic: '',
  primaryKeyword: '',
  searchIntent: 'INFORMATIONAL',
  contentType: 'GUIDE',
  priority: 'MEDIUM',
};

export default function ContentPlansPage() {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<ContentPlanListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateContentPlanInput>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await contentAutomationApi.listPlans({
        q: q.trim() || undefined,
        status: status || undefined,
        page,
        limit: 20,
      });
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setLoading(false);
    }
  }, [page, q, status]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    setPage(1);
  }, [q, status]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const plan = await contentAutomationApi.createPlan({
        ...form,
        topic: form.topic.trim(),
        primaryKeyword: form.primaryKeyword.trim(),
        supportingKeywords: form.supportingKeywords?.filter(Boolean),
      });
      toast.success('Đã tạo kế hoạch nội dung');
      setShowCreate(false);
      setForm(EMPTY_FORM);
      router.push(`/marketing/content-plans/${plan.id}`);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setCreating(false);
    }
  }

  return (
    <RequirePermission permission="cms.manage">
      <div className="space-y-4">
        <MarketingNav />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Kế hoạch nội dung (Content Automation)</h1>
            <p className="text-sm text-muted-foreground">
              M2 — CRUD + Content Intelligence (heuristic, không AI provider)
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)}>{vi.app.create}</Button>
        </div>

        {error ? <ErrorMessage message={error} /> : null}

        <Card className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              placeholder="Tìm chủ đề / từ khóa..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            <Button variant="secondary" onClick={() => void load()}>
              {vi.app.refresh}
            </Button>
          </div>

          {loading ? (
            <p>{vi.app.loading}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có kế hoạch nội dung.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4">Chủ đề</th>
                    <th className="py-2 pr-4">Từ khóa chính</th>
                    <th className="py-2 pr-4">Loại</th>
                    <th className="py-2 pr-4">Trạng thái</th>
                    <th className="py-2 pr-4">Cập nhật</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="py-2 pr-4">
                        <Link
                          href={`/marketing/content-plans/${item.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {item.topic}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">{item.primaryKeyword}</td>
                      <td className="py-2 pr-4">{item.contentType}</td>
                      <td className="py-2 pr-4">{item.status}</td>
                      <td className="py-2 pr-4">
                        {new Date(item.updatedAt).toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {total} kế hoạch · trang {page}/{totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Trước
              </Button>
              <Button
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Sau
              </Button>
            </div>
          </div>
        </Card>

        {showCreate ? (
          <Card className="space-y-4 p-4">
            <h2 className="font-medium">Tạo kế hoạch mới</h2>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => void handleCreate(e)}>
              <div>
                <Label>Chủ đề *</Label>
                <Input
                  value={form.topic}
                  onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>Từ khóa chính *</Label>
                <Input
                  value={form.primaryKeyword}
                  onChange={(e) => setForm((f) => ({ ...f, primaryKeyword: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>Search intent</Label>
                <Select
                  value={form.searchIntent}
                  onChange={(e) => setForm((f) => ({ ...f, searchIntent: e.target.value }))}
                >
                  {SEARCH_INTENTS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Content type</Label>
                <Select
                  value={form.contentType}
                  onChange={(e) => setForm((f) => ({ ...f, contentType: e.target.value }))}
                >
                  {CONTENT_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Góc nội dung (angle)</Label>
                <Input
                  value={form.angle ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, angle: e.target.value }))}
                />
              </div>
              <div>
                <Label>Từ khóa phụ (phân cách bằng dấu phẩy)</Label>
                <Input
                  value={(form.supportingKeywords ?? []).join(', ')}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      supportingKeywords: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }))
                  }
                />
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Button type="submit" disabled={creating}>
                  {creating ? vi.app.loading : vi.app.create}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>
                  {vi.app.cancel}
                </Button>
              </div>
            </form>
          </Card>
        ) : null}
      </div>
    </RequirePermission>
  );
}
