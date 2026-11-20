'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import {
  TurnstileField,
  captchaErrorFromApi,
  isTurnstileSiteKeyConfigured,
  type TurnstileFieldHandle,
} from '@/components/security/TurnstileField';
import { useTurnstileSiteKey } from '@/hooks/useTurnstileSiteKey';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Toast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import type { RegisterPayload } from '@/types/api';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { customerFacingError } from '@/lib/i18n/customer-error';
import { normalizeRegisterPhone } from '@/lib/normalize-register-phone';
import { safeInternalPath } from '@/lib/safe-redirect';
import { cn } from '@/lib/utils';

type FieldKey = 'fullName' | 'email' | 'phone' | 'password' | 'confirmPassword' | 'acceptTerms' | 'captcha';
type FieldErrors = Partial<Record<FieldKey, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs text-red-600" role="alert">
      {message}
    </p>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeInternalPath(searchParams.get('redirect'), '/');
  const prefillEmail = (searchParams.get('email') ?? '').trim();
  const { register } = useAuth();
  const t = useT();
  const { locale } = useLocale();
  const captchaRef = useRef<TurnstileFieldHandle>(null);
  const turnstileSiteKey = useTurnstileSiteKey();
  const captchaRequired = isTurnstileSiteKeyConfigured(turnstileSiteKey);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [form, setForm] = useState<RegisterPayload>({
    fullName: '',
    email: prefillEmail,
    phone: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false,
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!prefillEmail) return;
    setForm((prev) => (prev.email ? prev : { ...prev, email: prefillEmail }));
  }, [prefillEmail]);

  function clearFieldError(key: FieldKey) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function validateField(key: FieldKey, draft = form, token = captchaToken): string | undefined {
    switch (key) {
      case 'fullName': {
        const name = draft.fullName.trim();
        if (name.length < 2) return t('auth.fullNameRequired');
        return undefined;
      }
      case 'email': {
        const email = draft.email.trim().toLowerCase();
        if (!email) return t('auth.emailRequired');
        if (!EMAIL_RE.test(email)) return t('auth.emailInvalid');
        return undefined;
      }
      case 'phone': {
        const phone = normalizeRegisterPhone(draft.phone);
        if (!/^(\+84|0)[0-9]{9,10}$/.test(phone)) return t('auth.phoneInvalid');
        return undefined;
      }
      case 'password': {
        if (!draft.password) return t('auth.passwordRequired');
        if (draft.password.length < 8) return t('auth.passwordTooShort');
        return undefined;
      }
      case 'confirmPassword': {
        if (!draft.confirmPassword) return t('auth.confirmRequired');
        if (draft.password !== draft.confirmPassword) return t('auth.passwordMismatch');
        return undefined;
      }
      case 'acceptTerms':
        return draft.acceptTerms ? undefined : t('auth.needTerms');
      case 'captcha':
        return captchaRequired && !token ? t('auth.captchaRequired') : undefined;
      default:
        return undefined;
    }
  }

  function validateAll(draft = form, token = captchaToken): FieldErrors {
    const keys: FieldKey[] = [
      'fullName',
      'email',
      'phone',
      'password',
      'confirmPassword',
      'acceptTerms',
      'captcha',
    ];
    const next: FieldErrors = {};
    for (const key of keys) {
      const message = validateField(key, draft, token);
      if (message) next[key] = message;
    }
    return next;
  }

  function onBlurValidate(key: FieldKey) {
    const message = validateField(key);
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }

  function updateField<K extends keyof RegisterPayload>(key: K, value: RegisterPayload[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      return next;
    });
    if (key === 'fullName' || key === 'email' || key === 'phone' || key === 'password' || key === 'confirmPassword') {
      clearFieldError(key);
    }
    if (key === 'password' || key === 'confirmPassword') {
      clearFieldError('confirmPassword');
    }
    if (key === 'acceptTerms') {
      clearFieldError('acceptTerms');
    }
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const phone = normalizeRegisterPhone(form.phone);
    const draft = { ...form, phone, email: form.email.trim().toLowerCase(), fullName: form.fullName.trim() };
    const errors = validateAll(draft, captchaToken);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setFormError(t('auth.formFixFields'));
      const first = Object.keys(errors)[0] as FieldKey;
      const el = document.getElementById(`register-${first}`);
      el?.focus();
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setLoading(true);
    setFormError(null);
    try {
      await register({
        fullName: draft.fullName,
        phone,
        email: draft.email,
        password: draft.password,
        confirmPassword: draft.confirmPassword,
        acceptTerms: draft.acceptTerms,
        captchaToken: captchaToken || undefined,
      });
      setToast(t('auth.registerOk'));
      setTimeout(() => router.push(redirectTo || '/tai-khoan'), 800);
    } catch (err) {
      const captchaErr = captchaErrorFromApi(err);
      if (captchaErr) {
        setFieldErrors((prev) => ({ ...prev, captcha: captchaErr.message }));
        setFormError(captchaErr.message);
      } else {
        const message = customerFacingError(locale, err);
        setFormError(message);
      }
      // Turnstile token is single-use; always refresh after any failed submit
      // (409 email taken, 429, validation, etc.) so the next attempt can verify.
      captchaRef.current?.reset();
      setCaptchaToken(null);
    } finally {
      setLoading(false);
    }
  }

  const inputErrorClass = 'border-red-400 focus:border-red-500 focus:ring-red-500/20';

  return (
    <>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      <AuthLayout
        title={t('auth.registerTitle')}
        subtitle={t('auth.registerSubtitle')}
        footer={
          <p className="text-center text-sm text-cardon-gray">
            {t('auth.hasAccount')}{' '}
            <Link
              href={`/login?redirect=${encodeURIComponent(redirectTo)}`}
              className="font-semibold text-cardon-blue hover:underline"
            >
              {t('nav.login')}
            </Link>
          </p>
        }
      >
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div>
            <label className="text-sm font-medium text-cardon-navy" htmlFor="register-fullName">
              {t('auth.fullName')}
            </label>
            <Input
              id="register-fullName"
              className={cn('mt-1', fieldErrors.fullName && inputErrorClass)}
              value={form.fullName}
              onChange={(e) => updateField('fullName', e.target.value)}
              onBlur={() => onBlurValidate('fullName')}
              autoComplete="name"
              aria-invalid={Boolean(fieldErrors.fullName)}
            />
            <FieldError message={fieldErrors.fullName} />
          </div>
          <div>
            <label className="text-sm font-medium text-cardon-navy" htmlFor="register-email">
              {t('auth.email')}
            </label>
            <Input
              id="register-email"
              className={cn('mt-1', fieldErrors.email && inputErrorClass)}
              type="email"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              onBlur={() => onBlurValidate('email')}
              autoComplete="email"
              aria-invalid={Boolean(fieldErrors.email)}
            />
            <FieldError message={fieldErrors.email} />
          </div>
          <div>
            <label className="text-sm font-medium text-cardon-navy" htmlFor="register-phone">
              {t('auth.phone')}
            </label>
            <Input
              id="register-phone"
              className={cn('mt-1', fieldErrors.phone && inputErrorClass)}
              type="tel"
              placeholder="0912345678"
              value={form.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              onBlur={() => {
                setForm((prev) => ({
                  ...prev,
                  phone: normalizeRegisterPhone(prev.phone) || prev.phone,
                }));
                onBlurValidate('phone');
              }}
              autoComplete="tel"
              aria-invalid={Boolean(fieldErrors.phone)}
            />
            <p className="mt-1 text-xs text-cardon-gray">{t('auth.phoneHint')}</p>
            <FieldError message={fieldErrors.phone} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-cardon-navy" htmlFor="register-password">
                {t('auth.password')}
              </label>
              <Input
                id="register-password"
                className={cn('mt-1', fieldErrors.password && inputErrorClass)}
                type="password"
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                onBlur={() => onBlurValidate('password')}
                autoComplete="new-password"
                aria-invalid={Boolean(fieldErrors.password)}
              />
              <FieldError message={fieldErrors.password} />
            </div>
            <div>
              <label className="text-sm font-medium text-cardon-navy" htmlFor="register-confirmPassword">
                {t('auth.confirmPassword')}
              </label>
              <Input
                id="register-confirmPassword"
                className={cn('mt-1', fieldErrors.confirmPassword && inputErrorClass)}
                type="password"
                value={form.confirmPassword}
                onChange={(e) => updateField('confirmPassword', e.target.value)}
                onBlur={() => onBlurValidate('confirmPassword')}
                autoComplete="new-password"
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
              />
              <FieldError message={fieldErrors.confirmPassword} />
            </div>
          </div>
          <div>
            <label
              id="register-acceptTerms"
              className={cn(
                'flex items-start gap-2 text-sm text-cardon-gray',
                fieldErrors.acceptTerms && 'rounded-md ring-1 ring-red-300',
              )}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={form.acceptTerms}
                onChange={(e) => updateField('acceptTerms', e.target.checked)}
                onBlur={() => onBlurValidate('acceptTerms')}
                aria-invalid={Boolean(fieldErrors.acceptTerms)}
              />
              <span>
                {t('auth.accept')}{' '}
                <Link href="/dieu-khoan-su-dung" className="text-cardon-blue hover:underline" target="_blank">
                  {t('auth.terms')}
                </Link>{' '}
                {t('auth.and')}{' '}
                <Link href="/chinh-sach-bao-mat" className="text-cardon-blue hover:underline" target="_blank">
                  {t('auth.privacy')}
                </Link>
              </span>
            </label>
            <FieldError message={fieldErrors.acceptTerms} />
          </div>
          <div id="register-captcha">
            <TurnstileField
              ref={captchaRef}
              action="register"
              onTokenChange={(token) => {
                setCaptchaToken(token);
                if (token) clearFieldError('captcha');
              }}
              label={t('auth.captchaLabel')}
              hint={t('auth.captchaHint')}
              pendingText={t('auth.captchaPending')}
              readyText={t('auth.captchaReady')}
              className={fieldErrors.captcha ? 'border-red-300' : undefined}
            />
            <FieldError message={fieldErrors.captcha} />
          </div>
          {formError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {formError}
            </p>
          )}
          <Button
            className="w-full"
            type="submit"
            disabled={loading}
          >
            {loading ? t('auth.registering') : t('auth.register')}
          </Button>
          {captchaRequired && captchaToken ? (
            <p className="text-center text-xs text-cardon-gray">
              {t('auth.captchaReady')}
            </p>
          ) : null}
        </form>
      </AuthLayout>
    </>
  );
}

export default function RegisterPageClient() {
  return (
    <Suspense fallback={<p className="page-shell text-center text-cardon-gray">…</p>}>
      <RegisterForm />
    </Suspense>
  );
}
