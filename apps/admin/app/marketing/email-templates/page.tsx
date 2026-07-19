'use client';

import { useEffect, useState } from 'react';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label, Textarea } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { emailTemplateAdminApi, ApiClientError } from '@/services/api-client';

interface EmailTemplateRow {
  id: string;
  code: string;
  name: string;
  subject: string;
  htmlBody: string;
  textBody: string | null;
  variables: string[];
  isActive: boolean;
}

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setTemplates(await emailTemplateAdminApi.list());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function updateTemplate(index: number, patch: Partial<EmailTemplateRow>) {
    setTemplates((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function save() {
    setSaving(true);
    try {
      setTemplates(await emailTemplateAdminApi.save(templates));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <RequirePermission permission="cms.manage">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Email Templates</h1>
        <p className="text-sm text-zinc-500">
          Biến: {'{{customerName}}'}, {'{{orderCode}}'}, {'{{items}}'}, {'{{total}}'}
        </p>
        <MarketingNav />
        {error && <ErrorMessage message={error} />}
        {loading ? (
          <p>Đang tải...</p>
        ) : (
          <div className="space-y-4">
            {templates.map((template, index) => (
              <Card key={template.code} className="space-y-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">{template.name}</h2>
                  <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-mono">{template.code}</span>
                </div>
                <div>
                  <Label>Tiêu đề</Label>
                  <Input
                    className="mt-1"
                    value={template.subject}
                    onChange={(e) => updateTemplate(index, { subject: e.target.value })}
                  />
                </div>
                <div>
                  <Label>HTML body</Label>
                  <Textarea
                    className="mt-1"
                    rows={6}
                    value={template.htmlBody}
                    onChange={(e) => updateTemplate(index, { htmlBody: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Text body</Label>
                  <Textarea
                    className="mt-1"
                    rows={4}
                    value={template.textBody ?? ''}
                    onChange={(e) => updateTemplate(index, { textBody: e.target.value })}
                  />
                </div>
              </Card>
            ))}
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu templates'}
            </Button>
          </div>
        )}
      </div>
    </RequirePermission>
  );
}
