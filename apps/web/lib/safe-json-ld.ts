/**
 * Serialize JSON-LD for `<script type="application/ld+json">`.
 * Plain JSON.stringify leaves `</script>` intact, so CMS-controlled strings could break
 * out of the script tag. Escape `<` (and U+2028/2029) so the payload stays inert data.
 */
export function safeJsonLd(value: unknown): string {
  return (JSON.stringify(value) ?? 'null')
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
