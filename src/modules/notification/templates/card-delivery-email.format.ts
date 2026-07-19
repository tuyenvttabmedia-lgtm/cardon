function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatCardDeliveryEmailBlocks(
  cards: Array<{ serial: string; pin: string }>,
): { cardsHtml: string; cardsText: string } {
  if (cards.length === 0) {
    return {
      cardsHtml:
        '<p>Vui lòng tra cứu đơn hàng trên CardOn.vn nếu bạn chưa thấy thông tin thẻ.</p>',
      cardsText: 'Vui lòng tra cứu đơn hàng trên CardOn.vn nếu bạn chưa thấy thông tin thẻ.',
    };
  }

  const rows = cards
    .map(
      (card, index) =>
        `<tr><td style="padding:8px;border:1px solid #e5e7eb;">${index + 1}</td>` +
        `<td style="padding:8px;border:1px solid #e5e7eb;font-family:monospace;">${escapeHtml(card.serial)}</td>` +
        `<td style="padding:8px;border:1px solid #e5e7eb;font-family:monospace;">${escapeHtml(card.pin)}</td></tr>`,
    )
    .join('');

  const cardsHtml =
    `<table style="border-collapse:collapse;width:100%;max-width:520px;margin-top:12px;">` +
    `<thead><tr>` +
    `<th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">#</th>` +
    `<th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Serial</th>` +
    `<th style="padding:8px;border:1px solid #e5e7eb;text-align:left;">Mã thẻ</th>` +
    `</tr></thead><tbody>${rows}</tbody></table>` +
    `<p style="margin-top:12px;font-size:13px;color:#6b7280;">Vui lòng bảo mật email này và không chia sẻ mã thẻ.</p>`;

  const cardsText = cards
    .map((card, index) => `Thẻ ${index + 1}: Serial ${card.serial} | Mã ${card.pin}`)
    .join('\n');

  return { cardsHtml, cardsText };
}
