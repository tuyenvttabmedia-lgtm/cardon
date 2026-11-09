import {
  attachmentUrlMatchesFilename,
  extractExactSupportAttachmentFilename,
  normalizeAttachmentPathname,
} from './support-attachment-url.util';

describe('support-attachment-url.util (A-SUBSTR fix)', () => {
  describe('positive exact matches', () => {
    it('matches /uploads/support/a.png exactly', () => {
      expect(attachmentUrlMatchesFilename('/uploads/support/a.png', 'a.png')).toBe(
        true,
      );
      expect(extractExactSupportAttachmentFilename('/uploads/support/a.png')).toBe(
        'a.png',
      );
    });

    it('matches API prefixes and query string stripped', () => {
      expect(
        attachmentUrlMatchesFilename('/account/support/files/a.png?x=1', 'a.png'),
      ).toBe(true);
      expect(
        attachmentUrlMatchesFilename('/admin/support/files/a.png#frag', 'a.png'),
      ).toBe(true);
      expect(
        normalizeAttachmentPathname('/uploads/support/a.png?x=1'),
      ).toBe('/uploads/support/a.png');
    });

    it('matches absolute https URL pathname', () => {
      expect(
        attachmentUrlMatchesFilename(
          'https://cardon.vn/uploads/support/legacy-1.png?v=2',
          'legacy-1.png',
        ),
      ).toBe(true);
    });

    it('matches bare filename', () => {
      expect(attachmentUrlMatchesFilename('solo.png', 'solo.png')).toBe(true);
    });
  });

  describe('negative substring / lookalike cases', () => {
    it('does not allow a.png when stored as a.png.bak', () => {
      expect(
        attachmentUrlMatchesFilename('/uploads/support/a.png.bak', 'a.png'),
      ).toBe(false);
      expect(
        extractExactSupportAttachmentFilename('/uploads/support/a.png.bak'),
      ).toBe('a.png.bak');
    });

    it('does not allow a.png when stored as backup_a.png', () => {
      expect(
        attachmentUrlMatchesFilename('/uploads/support/backup_a.png', 'a.png'),
      ).toBe(false);
    });

    it('does not allow includes-style false positives', () => {
      expect(
        attachmentUrlMatchesFilename(
          '/uploads/support/prefix_a.png_suffix.png',
          'a.png',
        ),
      ).toBe(false);
    });

    it('rejects traversal and multi-segment paths', () => {
      expect(
        extractExactSupportAttachmentFilename('/uploads/support/../etc/passwd'),
      ).toBeNull();
      expect(
        extractExactSupportAttachmentFilename('/uploads/support/a/b.png'),
      ).toBeNull();
      expect(attachmentUrlMatchesFilename('/uploads/support/../x.png', 'x.png')).toBe(
        false,
      );
    });

    it('rejects dangerous schemes', () => {
      expect(
        extractExactSupportAttachmentFilename('javascript:alert(1)'),
      ).toBeNull();
    });
  });
});
