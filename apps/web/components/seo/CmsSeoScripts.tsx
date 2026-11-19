'use client';

import Script from 'next/script';

interface Props {
  googleAnalyticsId?: string;
  googleTagManagerId?: string;
}

/** Admin-configured ids are interpolated into inline JS — accept only the official id shapes. */
const GTM_ID_RE = /^GTM-[A-Z0-9]{4,12}$/;
const GA_ID_RE = /^(?:G-[A-Z0-9]{4,20}|UA-\d{4,12}-\d{1,4}|AW-\d{6,14})$/;

export function normalizeGtmId(value?: string): string | null {
  const id = value?.trim().toUpperCase();
  return id && GTM_ID_RE.test(id) ? id : null;
}

export function normalizeGaId(value?: string): string | null {
  const id = value?.trim().toUpperCase();
  return id && GA_ID_RE.test(id) ? id : null;
}

export function CmsSeoScripts({ googleAnalyticsId, googleTagManagerId }: Props) {
  const gaId = normalizeGaId(googleAnalyticsId);
  const gtmId = normalizeGtmId(googleTagManagerId);

  if (!gaId && !gtmId) return null;

  return (
    <>
      {gtmId ? (
        <Script id="cms-gtm" strategy="lazyOnload">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+encodeURIComponent(i)+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer',${JSON.stringify(gtmId)});`}
        </Script>
      ) : null}
      {gaId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`}
            strategy="lazyOnload"
          />
          <Script id="cms-ga" strategy="lazyOnload">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(gaId)});`}
          </Script>
        </>
      ) : null}
    </>
  );
}
