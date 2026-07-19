'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { FaqLiteEditor } from '@/components/marketing/faq/FaqLiteEditor';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Select } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Toast';
import { slugifyVi } from '@/lib/slugify-vi';
import { vi } from '@/lib/i18n/vi';
import { faqAdminApi, ApiClientError } from '@/services/api-client';
import type { FaqCategory } from '@/types/api';

const HOMEPAGE_POSITION = 'homepage';

const POSITION_OPTIONS = [
  { value: HOMEPAGE_POSITION, label: 'Trang chủ' },
  { value: 'topup', label: 'Nạp cước' },
  { value: 'data', label: 'Nạp data' },
  { value: 'contact', label: 'Liên hệ' },
];

const EMPTY_ANSWER = '<p></p>';

export default function FaqEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const isNew = params.id === 'new';

  const [categories, setCategories] = useState<FaqCategory[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const [categoryId, setCategoryId] = useState('');
  const [question, setQuestion] = useState('');
  const [slug, setSlug] = useState('');
  const [answer, setAnswer] = useState(EMPTY_ANSWER);
  const [featured, setFeatured] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);
  const [status, setStatus] = useState<'DRAFT' | 'ACTIVE' | 'INACTIVE'>('DRAFT');
  const [positions, setPositions] = useState<string[]>([]);
  const [slugTouched, setSlugTouched] = useState(false);

  const prepareNewFaqForm = useCallback((keepCategoryId?: string) => {
    const catId = keepCategoryId ?? categoryId ?? categories[0]?.id ?? '';
    setQuestion('');
    setSlug('');
    setAnswer(EMPTY_ANSWER);
    setFeatured(false);
    setStatus('DRAFT');
    setPositions([]);
    setSlugTouched(false);
    setCategoryId(catId);
    setFormKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => document.getElementById('faq-question-input')?.focus(), 150);
  }, [categories, categoryId]);

  useEffect(() => {
    void faqAdminApi.listCategories().then((rows) => {
      setCategories(rows);
      if (isNew && rows[0] && !categoryId) {
        setCategoryId(rows[0].id);
      }
    });
  }, [categoryId, isNew]);

  useEffect(() => {
    if (isNew) return;
    void (async () => {
      setLoading(true);
      try {
        const item = await faqAdminApi.get(params.id);
        setCategoryId(item.categoryId);
        setQuestion(item.question);
        setSlug(item.slug);
        setAnswer(item.answer);
        setFeatured(item.featured);
        setSortOrder(item.sortOrder);
        setStatus(item.status);
        setPositions(item.positions);
        setError(null);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
      } finally {
        setLoading(false);
      }
    })();
  }, [isNew, params.id]);

  useEffect(() => {
    if (!slugTouched && question.trim()) {
      setSlug(slugifyVi(question));
    }
  }, [question, slugTouched]);

  function togglePosition(value: string) {
    if (value === HOMEPAGE_POSITION) {
      setFeatured((prev) => !prev);
      return;
    }
    setPositions((prev) =>
      prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value],
    );
  }

  function isPositionChecked(value: string) {
    if (value === HOMEPAGE_POSITION) return featured;
    return positions.includes(value);
  }

  async function save(nextStatus?: 'DRAFT' | 'ACTIVE') {
    if (!categoryId || !question.trim()) {
      toast.error('Vui lòng nhập câu hỏi và chọn danh mục');
      return;
    }
    setSaving(true);
    const publishStatus = nextStatus ?? status;
    const basePayload = {
      categoryId,
      question: question.trim(),
      answer,
      slug: slug.trim() || slugifyVi(question),
      featured,
      status: publishStatus,
      positions: positions.filter((p) => p !== HOMEPAGE_POSITION),
    };
    try {
      if (isNew) {
        const created = await faqAdminApi.create(basePayload);
        if (publishStatus === 'ACTIVE') {
          toast.success(`Đã xuất bản (#${created.sortOrder}) — thêm câu hỏi tiếp theo`);
          prepareNewFaqForm(categoryId);
        } else {
          toast.success('Đã lưu nháp');
          router.replace(`/marketing/faq/${created.id}`);
        }
      } else {
        await faqAdminApi.update(params.id, { ...basePayload, sortOrder });
        if (publishStatus === 'ACTIVE') {
          toast.success('Đã xuất bản — thêm câu hỏi tiếp theo');
          router.replace('/marketing/faq/new');
        } else {
          toast.success('Đã lưu FAQ');
        }
      }
      setError(null);
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : vi.app.requestFailed;
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (isNew) return;
    if (!window.confirm('Xóa FAQ này?')) return;
    try {
      await faqAdminApi.delete(params.id);
      toast.success('Đã xóa');
      router.push('/marketing/faq');
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  if (loading) {
    return (
      <RequirePermission permission="cms.manage">
        <p className="text-zinc-500">{vi.app.loading}</p>
      </RequirePermission>
    );
  }

  return (
    <RequirePermission permission="cms.manage">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/marketing/faq" className="text-sm text-admin-600 hover:underline">
              ← Quay lại danh sách
            </Link>
            <h1 className="mt-1 text-2xl font-bold">{isNew ? 'Thêm FAQ' : 'Sửa FAQ'}</h1>
            {isNew && (
              <p className="mt-1 text-sm text-zinc-500">
                Thứ tự hiển thị tự động theo danh mục. Sau khi xuất bản, form reset để thêm tiếp.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {!isNew && (
              <Button variant="danger" onClick={() => void remove()}>
                Xóa
              </Button>
            )}
            <Button variant="secondary" onClick={() => void save('DRAFT')} disabled={saving}>
              Lưu nháp
            </Button>
            <Button onClick={() => void save('ACTIVE')} disabled={saving}>
              {saving ? 'Đang lưu...' : 'Xuất bản'}
            </Button>
          </div>
        </div>

        <MarketingNav />
        {error && <ErrorMessage message={error} />}

        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <Card className="space-y-4 p-4">
            <div>
              <label className="text-xs text-zinc-500">Câu hỏi</label>
              <Input
                id="faq-question-input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Slug URL</label>
              <Input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500">Câu trả lời</label>
              <FaqLiteEditor key={formKey} value={answer} onChange={setAnswer} />
            </div>
          </Card>

          <Card className="space-y-4 p-4">
            <div>
              <label className="text-xs text-zinc-500">Danh mục</label>
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs text-zinc-500">Trạng thái</label>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
              >
                <option value="DRAFT">Nháp</option>
                <option value="ACTIVE">Đang hiển thị</option>
                <option value="INACTIVE">Ẩn</option>
              </Select>
            </div>
            {!isNew && (
              <div>
                <label className="text-xs text-zinc-500">Thứ tự hiển thị</label>
                <Input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                />
                <p className="mt-1 text-xs text-zinc-400">
                  Số nhỏ hiển thị trước. Chỉnh khi cần đổi vị trí thủ công.
                </p>
              </div>
            )}
            <div>
              <p className="mb-2 text-xs text-zinc-500">Vị trí hiển thị</p>
              {POSITION_OPTIONS.map((opt) => (
                <label key={opt.value} className="mb-1 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={isPositionChecked(opt.value)}
                    onChange={() => togglePosition(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {featured && (
              <p className="text-xs text-amber-700">
                Trang chủ chỉ hiển thị 10 FAQ nổi bật đầu tiên theo thứ tự.
              </p>
            )}
          </Card>
        </div>
      </div>
    </RequirePermission>
  );
}
