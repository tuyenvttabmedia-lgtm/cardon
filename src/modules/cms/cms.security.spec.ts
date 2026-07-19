import { validate } from 'class-validator';
import { sanitizeCmsHtml } from './entities/cms-html-safety';
import { mapCmsPageForPublic } from './entities/cms-public.mapper';
import { UpdateCmsSeoSettingsDto } from './dto/cms.dto';
import { CMS_ROBOTS_TXT_MAX_LENGTH } from './entities/cms.constants';

describe('Phase 5C.4 — CMS HTML sanitize', () => {
  it('removes script tags and content', () => {
    const input = '<p>Hello</p><script>alert(1)</script><p>World</p>';
    expect(sanitizeCmsHtml(input)).toBe('<p>Hello</p><p>World</p>');
  });

  it('removes untrusted iframe embeds', () => {
    const input = '<p>Hi</p><iframe src="https://evil.com"></iframe>';
    expect(sanitizeCmsHtml(input)).toBe('<p>Hi</p>');
  });

  it('allows YouTube iframe embeds', () => {
    const input =
      '<iframe src="https://www.youtube.com/embed/abc123"></iframe>';
    expect(sanitizeCmsHtml(input)).toContain('youtube.com/embed/abc123');
  });

  it('allows img tags with safe src', () => {
    const input = '<img src="https://cardon.vn/uploads/articles/a.png" alt="A">';
    expect(sanitizeCmsHtml(input)).toContain('<img src="https://cardon.vn/uploads/articles/a.png"');
  });

  it('allows table markup', () => {
    const input = '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>';
    expect(sanitizeCmsHtml(input)).toContain('<table>');
    expect(sanitizeCmsHtml(input)).toContain('<td>');
  });

  it('blocks javascript: URLs in href', () => {
    const input = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeCmsHtml(input);
    expect(result).not.toContain('javascript:');
    expect(result).toBe('<a href="#">click</a>');
  });

  it('allows safe anchor href', () => {
    const input = '<a href="https://cardon.vn/about">About</a>';
    expect(sanitizeCmsHtml(input)).toBe(
      '<a href="https://cardon.vn/about">About</a>',
    );
  });

  it('allows basic formatting tags', () => {
    const input = '<p><strong>Bold</strong> and <em>italic</em></p>';
    expect(sanitizeCmsHtml(input)).toBe(
      '<p><strong>Bold</strong> and <em>italic</em></p>',
    );
  });

  it('allows pre, code, and hr tags', () => {
    const input =
      '<p>Text</p><hr><pre><code>const x = 1;</code></pre>';
    const result = sanitizeCmsHtml(input);
    expect(result).toContain('<hr>');
    expect(result).toContain('<pre>');
    expect(result).toContain('<code>');
    expect(result).toContain('const x = 1;');
  });

  it('strips disallowed tags like object/embed', () => {
    const input = '<object data="x"></object><p>OK</p>';
    expect(sanitizeCmsHtml(input)).toBe('<p>OK</p>');
  });

  it('preserves safe heading ids for article anchors', () => {
    const input = '<h2 id="section-1">Title</h2><h3 id="bad id">Sub</h3>';
    const result = sanitizeCmsHtml(input);
    expect(result).toBe('<h2 id="section-1">Title</h2><h3>Sub</h3>');
  });

  it('preserves whitelisted cms-block layout classes', () => {
    const input =
      '<div class="cms-block-section evil"><div class="cms-block-grid-3"><div class="cms-block-card"><p class="cms-block-card-title">OK</p></div></div></div>';
    const result = sanitizeCmsHtml(input);
    expect(result).toContain('class="cms-block-section"');
    expect(result).toContain('class="cms-block-grid-3"');
    expect(result).toContain('class="cms-block-card"');
    expect(result).toContain('class="cms-block-card-title"');
    expect(result).not.toContain('evil');
  });

  it('mapCmsPageForPublic sanitizes content but preserves title', () => {
    const mapped = mapCmsPageForPublic({
      id: '1',
      slug: 'test',
      title: 'Title',
      content: '<p>Safe</p><script>x</script>',
      excerpt: null,
      featuredImage: null,
      category: null,
      tags: ['a'],
      publishedAt: new Date(),
      seo: { metaTitle: 'T', metaDescription: 'D' },
    });
    expect(mapped.title).toBe('Title');
    expect(mapped.content).toBe('<p>Safe</p>');
  });
});

describe('Phase 5C.4 — robots.txt validation', () => {
  it('accepts robots.txt within max length', async () => {
    const dto = new UpdateCmsSeoSettingsDto();
    dto.robotsTxt = 'User-agent: *\nDisallow:';
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects robots.txt over max length', async () => {
    const dto = new UpdateCmsSeoSettingsDto();
    dto.robotsTxt = 'x'.repeat(CMS_ROBOTS_TXT_MAX_LENGTH + 1);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'robotsTxt')).toBe(true);
  });
});
