import { HomeServiceType } from '@prisma/client';
import { inferHomeServiceFromCategorySlug } from './home-service';

describe('home-service', () => {
  it('infers legacy category slugs', () => {
    expect(inferHomeServiceFromCategorySlug('the-dien-thoai')).toBe(HomeServiceType.PHONE_CARD);
    expect(inferHomeServiceFromCategorySlug('the-ien-thoai')).toBe(HomeServiceType.PHONE_CARD);
    expect(inferHomeServiceFromCategorySlug('local-demo-topup')).toBe(HomeServiceType.TOPUP);
    expect(inferHomeServiceFromCategorySlug('local-demo-cards')).toBe(HomeServiceType.GAME_CARD);
    expect(inferHomeServiceFromCategorySlug('nap-data')).toBe(HomeServiceType.DATA);
  });

  it('defaults unknown slugs to GAME_CARD', () => {
    expect(inferHomeServiceFromCategorySlug('misc-catalog')).toBe(HomeServiceType.GAME_CARD);
  });
});
