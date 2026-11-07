'use client';

import { Suspense, useMemo, type ReactNode } from 'react';
import { StorefrontHero } from '@/components/layout/StorefrontHero';
import { useBarePath, useT } from '@/components/i18n/LocaleProvider';
import type { MessageKey } from '@/lib/i18n/messages';
import { useThemeSettings } from '@/hooks/useThemeSettings';
import { CARD_GAME_PATH, CARD_PHONE_PATH } from '@/lib/checkout-services';
import type { HomeBackgrounds } from '@/lib/home-backgrounds';

type HubHeroCopy = {
  title: string;
  subtitle: string;
  backgroundKey: keyof HomeBackgrounds;
  points: Array<{ title: string; icon: ReactNode }>;
};

function resolveHubHero(pathname: string, t: (key: MessageKey) => string): HubHeroCopy | null {
  if (pathname.startsWith(CARD_GAME_PATH)) {
    return {
      title: t('hub.gameTitle'),
      subtitle: t('hub.gameBody'),
      backgroundKey: 'hubHeroGameBg',
      points: [
        { title: t('hub.instant'), icon: <BoltIcon /> },
        { title: t('hub.publishers'), icon: <GameIcon /> },
        { title: t('hub.secure'), icon: <ShieldIcon /> },
        { title: t('hub.viSupport'), icon: <ChatIcon /> },
      ],
    };
  }
  if (pathname.startsWith(CARD_PHONE_PATH)) {
    return {
      title: t('hub.phoneTitle'),
      subtitle: t('hub.phoneBody'),
      backgroundKey: 'hubHeroPhoneBg',
      points: [
        { title: t('hub.autoPin'), icon: <BoltIcon /> },
        { title: t('hub.carriers'), icon: <PhoneIcon /> },
        { title: t('hub.denoms'), icon: <TagIcon /> },
        { title: t('hub.viSupport'), icon: <ChatIcon /> },
      ],
    };
  }
  if (pathname.startsWith('/nap-cuoc')) {
    return {
      title: t('hub.topupTitle'),
      subtitle: t('hub.topupBody'),
      backgroundKey: 'hubHeroTopupBg',
      points: [
        { title: t('hub.autoTopup'), icon: <BoltIcon /> },
        { title: t('home.allCarriers'), icon: <PhoneIcon /> },
        { title: t('hub.publicPrice'), icon: <TagIcon /> },
        { title: t('hub.viSupport'), icon: <ChatIcon /> },
      ],
    };
  }
  if (pathname.startsWith('/nap-data')) {
    return {
      title: t('hub.dataTitle'),
      subtitle: t('hub.dataBody'),
      backgroundKey: 'hubHeroTopupBg',
      points: [
        { title: t('hub.fastData'), icon: <BoltIcon /> },
        { title: t('hub.dayMonth'), icon: <SignalIcon /> },
        { title: t('hub.secure'), icon: <ShieldIcon /> },
        { title: t('hub.viSupport'), icon: <ChatIcon /> },
      ],
    };
  }
  return null;
}

function HubHeroPoints({ points }: { points: HubHeroCopy['points'] }) {
  return (
    <ul className="mt-4 grid max-w-md grid-cols-2 gap-2">
      {points.map((item) => (
        <li
          key={item.title}
          className="inline-flex w-full items-center gap-2 rounded-full border border-white bg-white px-3.5 py-2 text-sm font-semibold leading-none text-cardon-navy shadow-sm"
        >
          <span className="text-cardon-blue [&_svg]:h-[18px] [&_svg]:w-[18px]">{item.icon}</span>
          {item.title}
        </li>
      ))}
    </ul>
  );
}

function CheckoutChromeInner({ children }: { children: React.ReactNode }) {
  const pathname = useBarePath();
  const t = useT();
  const { homeBackgrounds } = useThemeSettings();
  const hub = useMemo(() => resolveHubHero(pathname, t), [pathname, t]);

  if (pathname === '/' || !hub) {
    return <>{children}</>;
  }

  return (
    <>
      <StorefrontHero
        variant="hub"
        backgroundUrl={homeBackgrounds[hub.backgroundKey]}
        title={hub.title}
        subtitle={hub.subtitle}
        headingLevel="p"
      >
        <HubHeroPoints points={hub.points} />
      </StorefrontHero>
      {/* Same pull-up as home category row — sits in the soft fade, not over hero copy. */}
      <div className="relative z-10 site-container mt-1 space-y-6 pb-6 md:pb-8 lg:-mt-4">
        {children}
      </div>
    </>
  );
}

function CheckoutChromeFallback() {
  return (
    <div className="site-container space-y-6 py-6 md:py-8">
      <div className="relative min-h-[180px] animate-pulse rounded-2xl bg-gray-100 md:min-h-[260px]" />
    </div>
  );
}

export function CheckoutChrome({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<CheckoutChromeFallback />}>
      <CheckoutChromeInner>{children}</CheckoutChromeInner>
    </Suspense>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M13 3 5.5 13.5H12l-.8 7.5L18.5 10H12L13 3Z" strokeLinejoin="round" />
    </svg>
  );
}

function GameIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path
        d="M7.5 9.5h9a4.5 4.5 0 0 1 0 9H12l-2.2 2.2a1 1 0 0 1-1.6-.8V18.5H7.5a4.5 4.5 0 0 1 0-9Z"
        strokeLinejoin="round"
      />
      <path d="M9.5 14h2M10.5 13v2" strokeLinecap="round" />
      <circle cx="15.2" cy="13.2" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="16.8" cy="14.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" strokeLinecap="round" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3.5 12.5 12 4h6.5V10.5L10.5 18.5z" strokeLinejoin="round" />
      <circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 3 5 6.5v5.2c0 4.2 2.9 7.8 7 8.8 4.1-1 7-4.6 7-8.8V6.5L12 3Z" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SignalIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 18v-2M9 18v-5M14 18V9M19 18V5" strokeLinecap="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M5 16.5 4 20l3.5-1A8 8 0 1 0 5 16.5z" strokeLinejoin="round" />
    </svg>
  );
}
