'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useT } from '@/components/i18n/LocaleProvider';
import { buildVietQrPayload, type VietQrBuildInput } from '@/lib/vietqr';

/** Client-side NAPAS VietQR image from VA + amount + memo (no third-party host). */
export function VietQrImage(props: VietQrBuildInput) {
  const t = useT();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const payload = buildVietQrPayload(props);
    if (!payload) {
      setDataUrl(null);
      setFailed(true);
      return;
    }
    setFailed(false);
    void QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 360,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setDataUrl(null);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    props.accountNumber,
    props.bankCode,
    props.bankName,
    props.amount,
    props.addInfo,
  ]);

  if (failed || !dataUrl) {
    return (
      <p className="flex h-full min-h-[8rem] items-center justify-center px-2 text-sm text-cardon-gray">
        {t('pay.transferOnly')}
      </p>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- data URL from local EMV payload
    <img
      src={dataUrl}
      alt={t('pay.scanTitle')}
      className="mx-auto h-auto w-full max-w-[240px] object-contain sm:max-w-[300px] lg:max-w-[360px]"
    />
  );
}

export function canBuildVietQrImage(props: VietQrBuildInput): boolean {
  return buildVietQrPayload(props) != null;
}
