import { describe, expect, it } from 'vitest';
import {
  formatLocaleVnd,
  localeRoutingDecision,
  localeSwitchTarget,
  resolveLocale,
  stripLocalePrefix,
  withLocalePrefix,
} from './locale';
import { customerFacingError } from './customer-error';
import { translate } from './messages';
import { ApiClientError } from '@/services/api-client';

describe('storefront locale', () => {
  it('keeps Vietnamese URLs as the default', () => {
    expect(stripLocalePrefix('/the-game')).toEqual({ locale: null, pathname: '/the-game' });
    expect(resolveLocale({ pathname: '/the-game' })).toBe('vi');
    expect(localeRoutingDecision({ pathname: '/nap-cuoc', method: 'GET' })).toEqual({
      action: 'continue',
      locale: 'vi',
    });
  });

  it('rewrites /en onto the existing route and does not loop', () => {
    expect(stripLocalePrefix('/en/the-game')).toEqual({ locale: 'en', pathname: '/the-game' });
    expect(stripLocalePrefix('/en')).toEqual({ locale: 'en', pathname: '/' });
    expect(localeRoutingDecision({ pathname: '/en/esim', cookie: 'en' })).toEqual({
      action: 'rewrite',
      internalPath: '/esim',
      locale: 'en',
    });
    expect(withLocalePrefix('/the-game', 'en')).toBe('/en/the-game');
    expect(withLocalePrefix('/en/the-game', 'vi')).toBe('/the-game');
    expect(localeSwitchTarget('/en/the-game', '?q=1', 'vi')).toBe('/the-game?q=1');
    expect(localeSwitchTarget('/the-game', '?q=1', 'en')).toBe('/en/the-game?q=1');
  });

  it('keeps an English choice across navigation and drops it when Vietnamese is selected', () => {
    expect(localeRoutingDecision({ pathname: '/checkout', cookie: 'en', method: 'GET' })).toEqual({
      action: 'redirect',
      pathname: '/en/checkout',
      locale: 'en',
    });
    expect(localeRoutingDecision({ pathname: '/checkout', cookie: 'en', method: 'POST' })).toEqual({
      action: 'continue',
      locale: 'vi',
    });
    expect(localeRoutingDecision({ pathname: '/en/login', cookie: 'vi' })).toEqual({
      action: 'redirect',
      pathname: '/login',
      locale: 'vi',
    });
  });

  it('falls back to Vietnamese copy and translates the market notice', () => {
    expect(translate('vi', 'market.vnOnly')).toContain('Việt Nam');
    expect(translate('en', 'market.vnOnly')).toBe('This product is only sold in Vietnam.');
    expect(translate('en', 'nav.login')).toBe('Log in');
    expect(translate('vi', 'esim.salesOffTitle')).toBe('Tạm dừng bán eSIM');
    expect(translate('en', 'home.heroTitle')).not.toMatch(/[àáạảãâầấệế]/i);
    expect(translate('en', 'checkout.pay')).toBe('Pay');
    expect(translate('en', 'auth.registerTitle')).toBe('Create an account');
    expect(translate('vi', 'common.untranslated')).toContain('tiếng Việt');
  });

  it('shows English or an English fallback for customer API errors', () => {
    expect(customerFacingError('en', new Error('Chưa mở bán'))).toBe('eSIM sales paused');
    expect(customerFacingError('en', new ApiClientError('Yêu cầu thất bại (404)', 404, 'NOT_FOUND'))).toBe(
      'We could not find that.',
    );
    expect(customerFacingError('en', new Error('Yêu cầu thất bại (404)'))).toBe('We could not find that.');
    const unmapped = customerFacingError('en', new Error('Không tải được dữ liệu bí mật từ máy chủ'));
    expect(unmapped).toBe('Something went wrong. Try again or contact support.');
    expect(unmapped).not.toMatch(/[àáạảãâầấậèéêìíòóôơùúưỳýđ]/i);
    expect(customerFacingError('vi', new Error('Chưa mở bán'))).toBe('Tạm dừng bán eSIM');
  });

  it('formats VND without changing the currency', () => {
    expect(formatLocaleVnd(100000, 'vi')).toContain('100');
    expect(formatLocaleVnd(100000, 'en')).toContain('100');
    expect(formatLocaleVnd(100000, 'en')).toMatch(/VND|₫/);
  });
});
