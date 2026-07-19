'use client';

import { useState } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHero } from '@/components/layout/PageHero';
import { SafeCmsHtml } from '@/components/SafeCmsHtml';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useThemeSettings } from '@/hooks/useThemeSettings';
import { contactApi, ApiClientError } from '@/services/api-client';
import { FaqSection } from '@/components/faq/FaqSection';
import {
  CONTACT_CHANNEL_META,
  type ContactChannel,
} from '@/lib/contact-channels';

interface ContactPageClientProps {
  title?: string;
  subtitle?: string;
  introHtml?: string;
}

export function ContactPageClient({
  title = 'Liên hệ CardOn',
  subtitle = 'Chúng tôi luôn sẵn sàng hỗ trợ bạn 24/7.',
  introHtml,
}: ContactPageClientProps) {
  const { contactChannels } = useThemeSettings();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', message: '' });

  const visibleChannels = contactChannels.filter((channel) => channel.enabled && channel.value.trim());

  return (
    <PageContainer>
      <PageHero title={title} subtitle={subtitle} />
      {introHtml ? (
        <div className="mt-6 rounded-2xl border border-cardon-border bg-white p-5 shadow-card md:p-6">
          <SafeCmsHtml html={introHtml} className="cms-prose" />
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="rounded-2xl border border-cardon-border bg-white p-5 shadow-card md:p-6">
          <h2 className="text-lg font-bold text-cardon-navy">Thông tin liên hệ</h2>
          <ul className="mt-5 space-y-4">
            {visibleChannels.map((item) => (
              <ContactChannelItem key={item.key} channel={item} />
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-cardon-border bg-white p-5 shadow-card md:p-6">
          <h2 className="text-lg font-bold text-cardon-navy">Gửi tin nhắn</h2>
          {submitted ? (
            <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-cardon-green">
              Cảm ơn bạn! Chúng tôi sẽ phản hồi trong thời gian sớm nhất.
            </p>
          ) : (
            <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="text-sm font-medium">Họ và tên</label>
                <Input
                  required
                  className="mt-1"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    required
                    type="email"
                    className="mt-1"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Số điện thoại</label>
                  <Input
                    type="tel"
                    className="mt-1"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Chủ đề</label>
                <Input
                  required
                  className="mt-1"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Nội dung</label>
                <textarea
                  required
                  rows={5}
                  className="mt-1 w-full rounded-xl border border-cardon-border px-3 py-2 text-sm outline-none focus:border-cardon-blue"
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                />
              </div>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Đang gửi...' : 'Gửi liên hệ'}
              </Button>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </form>
          )}
        </div>
      </div>

      <FaqSection
        position="contact"
        limit={10}
        showViewAll
        viewAllHref="/tro-giup?position=contact"
        className="mt-10"
      />
    </PageContainer>
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await contactApi.submit(form);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Gửi liên hệ thất bại');
    } finally {
      setSubmitting(false);
    }
  }
}

function ContactChannelItem({ channel }: { channel: ContactChannel }) {
  const meta = CONTACT_CHANNEL_META[channel.key];

  return (
    <li className="flex gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-lg">
        {meta.icon}
      </span>
      <div>
        <p className="text-sm font-semibold text-cardon-navy">{meta.label}</p>
        {channel.href ? (
          <a
            href={channel.href}
            className="text-sm text-cardon-blue hover:underline"
            target={channel.href.startsWith('http') ? '_blank' : undefined}
            rel={channel.href.startsWith('http') ? 'noreferrer' : undefined}
          >
            {channel.value}
          </a>
        ) : (
          <p className="text-sm text-cardon-gray">{channel.value}</p>
        )}
      </div>
    </li>
  );
}
