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
  type ContactChannelKey,
} from '@/lib/contact-channels';
import { extractGoogleMapsEmbedUrl } from '@/lib/google-map';

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
  const { contactChannels, companyInfo } = useThemeSettings();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', message: '' });

  const visibleChannels = contactChannels.filter((channel) => channel.enabled && channel.value.trim());
  const workingHours = companyInfo.workingHours?.trim() || '';
  const quickActions = visibleChannels.filter(
    (c): c is ContactChannel & { href: string } =>
      Boolean(c.href) && (c.key === 'hotline' || c.key === 'zalo' || c.key === 'fanpage' || c.key === 'email'),
  );
  const mapEmbedUrl =
    companyInfo.googleMapEnabled === true
      ? extractGoogleMapsEmbedUrl(companyInfo.googleMapEmbedUrl)
      : null;

  return (
    <PageContainer>
      <PageHero title={title} subtitle={subtitle} />
      {introHtml ? (
        <div className="mt-6 rounded-2xl border border-cardon-border bg-white p-5 shadow-card md:p-6">
          <SafeCmsHtml html={introHtml} className="cms-prose" />
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:items-stretch">
        <aside className="flex h-full flex-col rounded-2xl border border-cardon-border bg-white p-5 shadow-card md:p-6">
          <h2 className="text-lg font-bold text-cardon-navy">Thông tin liên hệ</h2>
          <ul className="mt-5 space-y-5">
            {visibleChannels.map((item) => (
              <ContactChannelItem key={item.key} channel={item} />
            ))}
            {workingHours ? (
              <li className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-lg">
                  🕒
                </span>
                <div>
                  <p className="text-sm font-semibold text-cardon-navy">Thời gian làm việc</p>
                  <p className="text-sm text-cardon-gray">{workingHours}</p>
                </div>
              </li>
            ) : null}
          </ul>

          {quickActions.length > 0 ? (
            <div className="mt-6 grid grid-cols-2 gap-2">
              {quickActions.map((channel) => (
                <a
                  key={channel.key}
                  href={channel.href}
                  target={channel.href.startsWith('http') ? '_blank' : undefined}
                  rel={channel.href.startsWith('http') ? 'noreferrer' : undefined}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-cardon-border bg-zinc-50 px-3 py-2.5 text-xs font-semibold text-cardon-navy transition hover:border-cardon-blue hover:bg-blue-50 hover:text-cardon-blue"
                >
                  <span aria-hidden>{CONTACT_CHANNEL_META[channel.key].icon}</span>
                  {quickActionLabel(channel.key)}
                </a>
              ))}
            </div>
          ) : null}

          <div className="mt-auto space-y-3 pt-6">
            <div className="rounded-xl bg-gradient-to-br from-cardon-navy to-cardon-blue p-4 text-white">
              <p className="text-sm font-semibold">Phản hồi nhanh</p>
              <p className="mt-1 text-xs leading-relaxed text-white/85">
                Tin nhắn trong giờ làm việc thường được xử lý trong vài giờ. Ngoài giờ, vui lòng để lại
                email hoặc Zalo — chúng tôi sẽ liên hệ lại sớm nhất có thể.
              </p>
            </div>
            <div className="rounded-xl border border-dashed border-cardon-border bg-zinc-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-cardon-navy/70">
                Khi liên hệ nên kèm
              </p>
              <ul className="mt-2 space-y-1.5 text-sm text-cardon-gray">
                <li>• Mã đơn hàng (nếu có)</li>
                <li>• Số điện thoại / email đã dùng thanh toán</li>
                <li>• Mô tả ngắn vấn đề cần hỗ trợ</li>
              </ul>
            </div>
          </div>
        </aside>

        <div className="flex h-full flex-col rounded-2xl border border-cardon-border bg-white p-5 shadow-card md:p-6">
          <h2 className="text-lg font-bold text-cardon-navy">Gửi tin nhắn</h2>
          {submitted ? (
            <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-cardon-green">
              Cảm ơn bạn! Chúng tôi sẽ phản hồi trong thời gian sớm nhất.
            </p>
          ) : (
            <form className="mt-4 flex flex-1 flex-col space-y-4" onSubmit={handleSubmit}>
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
              <div className="flex flex-1 flex-col">
                <label className="text-sm font-medium">Nội dung</label>
                <textarea
                  required
                  rows={6}
                  className="mt-1 min-h-[9rem] w-full flex-1 rounded-xl border border-cardon-border px-3 py-2 text-sm outline-none focus:border-cardon-blue"
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                />
              </div>
              <div className="pt-1">
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Đang gửi...' : 'Gửi liên hệ'}
                </Button>
                {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
              </div>
            </form>
          )}
        </div>
      </div>

      {mapEmbedUrl ? (
        <section className="mt-8 overflow-hidden rounded-2xl border border-cardon-border bg-white shadow-card">
          <div className="border-b border-cardon-border px-5 py-4 md:px-6">
            <h2 className="text-lg font-bold text-cardon-navy">Bản đồ</h2>
            {companyInfo.address?.trim() ? (
              <p className="mt-1 text-sm text-cardon-gray">{companyInfo.address.trim()}</p>
            ) : null}
          </div>
          <div className="relative aspect-[16/10] w-full bg-zinc-100 md:aspect-[21/9]">
            <iframe
              title="Bản đồ trụ sở CardOn"
              src={mapEmbedUrl}
              className="absolute inset-0 h-full w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </section>
      ) : null}

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

function quickActionLabel(key: ContactChannelKey): string {
  switch (key) {
    case 'hotline':
      return 'Gọi ngay';
    case 'zalo':
      return 'Chat Zalo';
    case 'fanpage':
      return 'Fanpage';
    case 'email':
      return 'Gửi email';
    default:
      return CONTACT_CHANNEL_META[key].label;
  }
}

function ContactChannelItem({ channel }: { channel: ContactChannel }) {
  const meta = CONTACT_CHANNEL_META[channel.key];

  return (
    <li className="flex gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-lg">
        {meta.icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-cardon-navy">{meta.label}</p>
        {channel.href ? (
          <a
            href={channel.href}
            className="break-words text-sm text-cardon-blue hover:underline"
            target={channel.href.startsWith('http') ? '_blank' : undefined}
            rel={channel.href.startsWith('http') ? 'noreferrer' : undefined}
          >
            {channel.value}
          </a>
        ) : (
          <p className="break-words text-sm text-cardon-gray">{channel.value}</p>
        )}
      </div>
    </li>
  );
}
