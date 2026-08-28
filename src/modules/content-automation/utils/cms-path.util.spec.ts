import { blogPostPath, resolveCmsPublicPath, staticPagePath } from './cms-path.util';

describe('cms-path.util', () => {
  it('builds blog post path with category', () => {
    expect(blogPostPath('huong-dan', 'nap-the')).toBe('/tin-tuc/huong-dan/nap-the');
  });

  it('builds blog post path without category', () => {
    expect(blogPostPath(null, 'nap-the')).toBe('/nap-the');
  });

  it('builds static page path', () => {
    expect(staticPagePath('lien-he')).toBe('/lien-he');
  });

  it('resolves CMS public path by type', () => {
    expect(resolveCmsPublicPath('BLOG_POST', 'slug', 'cat')).toBe('/tin-tuc/cat/slug');
    expect(resolveCmsPublicPath('PAGE', 'slug', null)).toBe('/slug');
  });
});
