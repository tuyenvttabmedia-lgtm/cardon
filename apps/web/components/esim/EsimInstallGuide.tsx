'use client';

import type { ReactNode } from 'react';
import { useT } from '@/components/i18n/LocaleProvider';
import type { EsimPreviewOffer } from '@/lib/esim-offers';

export function EsimInstallGuide({
  offer,
  country,
}: {
  offer?: EsimPreviewOffer | null;
  country: string;
}) {
  const t = useT();
  const notes = offer?.operatorInfo?.filter(Boolean) ?? [];
  const networks = offer?.networks?.filter(Boolean) ?? [];
  const activation = offer?.activationLabel || t('esim.guideFollow');
  const apn =
    offer?.apnType?.toLowerCase() === 'manual' && offer.apnValue
      ? `${t('install.apnManual')}: ${offer.apnValue}.`
      : t('esim.guideApnAuto');
  const roaming = offer?.isRoaming ? t('esim.guideRoamOn') : t('esim.guideRoamOff');

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <GuideCard title="iPhone / iPad">
          <ol>
            <li>{t('install.ios1')}</li>
            <li>{t('install.ios2')}</li>
            <li>{t('install.ios3')}</li>
            <li>
              {t('install.ios4')} {roaming}
            </li>
          </ol>
        </GuideCard>
        <GuideCard title="Android">
          <ol>
            <li>{t('install.and1')}</li>
            <li>{t('install.and2')}</li>
            <li>{t('install.and3')}</li>
            <li>
              {t('install.and4')} {roaming}
            </li>
          </ol>
        </GuideCard>
      </div>
      <div className="rounded-2xl border border-cardon-border bg-white p-4 text-sm leading-relaxed text-cardon-dark">
        <p className="font-bold text-cardon-navy">
          {t('install.packInfo')} · {country}
        </p>
        <ul className="mt-2 space-y-1.5">
          <li>
            {t('esim.activate')}: {activation}
          </li>
          <li>{apn}</li>
          {networks.length > 0 ? (
            <li>
              {t('esim.network')}: {networks.join(', ')}
            </li>
          ) : null}
          {offer?.speedLabel ? (
            <li>
              {t('install.speed')}: {offer.speedLabel}
            </li>
          ) : null}
          {offer?.rechargeable ? <li>{t('install.topup')}</li> : null}
          {offer?.fairUsagePolicy ? (
            <li>
              {t('install.fup')}: {offer.fairUsagePolicy}
            </li>
          ) : null}
          {offer?.shortInfo ? <li>{offer.shortInfo}</li> : null}
          {offer?.otherInfo ? <li>{offer.otherInfo}</li> : null}
        </ul>
        {notes.length > 0 ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-cardon-gray">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 text-cardon-gray">{t('install.afterPay')}</p>
      </div>
    </div>
  );
}

function GuideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-cardon-border bg-white p-4 shadow-card">
      <h3 className="font-bold text-cardon-navy">{title}</h3>
      <div className="mt-2 text-sm leading-relaxed text-cardon-gray [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5">
        {children}
      </div>
    </div>
  );
}
