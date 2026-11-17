import { describe, expect, it } from 'vitest';
import { collapseDuplicateBlogSlugPath } from './blog-url-redirects';

describe('collapseDuplicateBlogSlugPath', () => {
  it('collapses identical trailing slug segments', () => {
    expect(
      collapseDuplicateBlogSlugPath(
        '/tin-tuc/the-game/chon-menh-gia-the-game-bao-nhieu-la-vua-du/chon-menh-gia-the-game-bao-nhieu-la-vua-du',
      ),
    ).toBe('/tin-tuc/the-game/chon-menh-gia-the-game-bao-nhieu-la-vua-du');
  });

  it('ignores normal post and category paths', () => {
    expect(collapseDuplicateBlogSlugPath('/tin-tuc/huong-dan/ma-the-va-so-serial')).toBeNull();
    expect(collapseDuplicateBlogSlugPath('/tin-tuc/huong-dan')).toBeNull();
    expect(collapseDuplicateBlogSlugPath('/tin-tuc')).toBeNull();
  });

  it('ignores non-matching fourth segments', () => {
    expect(collapseDuplicateBlogSlugPath('/tin-tuc/huong-dan/a/b')).toBeNull();
  });
});
