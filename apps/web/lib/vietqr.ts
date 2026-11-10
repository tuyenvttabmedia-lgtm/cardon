/**
 * NAPAS VietQR (EMVCo merchant-presented) helpers for MegaPay VA reopen.
 *
 * MegaPay confirms payment via bank IPN when money hits the issued VA — not by
 * validating who rendered the QR image. The QR is only a UX aid; matching still
 * depends on exact account number, amount, and transfer content.
 */

export type VietQrBuildInput = {
  accountNumber: string;
  /** NAPAS 6-digit BIN, or bank name/code we can map. */
  bankCode?: string | null;
  bankName?: string | null;
  /** VND integer (or numeric string). */
  amount: string | number;
  /** Transfer memo — MegaPay vaContent / payment_reference. */
  addInfo?: string | null;
};

/** Resolve NAPAS BIN from MegaPay bank fields. Returns null when unsafe to guess. */
export function resolveNapasBin(
  bankCode?: string | null,
  bankName?: string | null,
): string | null {
  const raw = `${bankCode ?? ''} ${bankName ?? ''}`.trim().toUpperCase();
  if (!raw) return null;

  const compact = raw.replace(/[^A-Z0-9]/g, '');
  const six = raw.match(/\b(\d{6})\b/);
  if (six) return six[1];

  // Kookmin — MegaPay EPAY retail VA commonly uses Hanoi branch.
  if (compact.includes('KOOKMIN') || compact === 'KBHN' || compact === 'KBHCM') {
    if (
      compact.includes('HCM') ||
      compact.includes('HOCHIMINH') ||
      compact.includes('SG') ||
      compact === 'KBHCM'
    ) {
      return '970463';
    }
    return '970462';
  }

  if (compact.includes('WOORI') || compact === 'WVN' || compact === 'WOORIBANK') {
    return '970457';
  }
  if (compact.includes('VIETCOMBANK') || compact === 'VCB') return '970436';
  if (compact.includes('VIETINBANK') || compact === 'ICB' || compact === 'CTG') return '970415';
  if (compact.includes('BIDV')) return '970418';
  if (compact.includes('TECHCOMBANK') || compact === 'TCB') return '970407';
  if (compact.includes('MBBANK') || compact === 'MB' || compact === 'MBBANK') return '970422';
  if (compact.includes('VPBANK') || compact === 'VPB') return '970432';
  if (compact.includes('ACB')) return '970416';
  if (compact.includes('SHINHAN')) return '970424';

  return null;
}

function tlv(tag: string, value: string): string {
  const len = value.length;
  if (len > 99) {
    throw new Error(`VietQR TLV value too long for tag ${tag}`);
  }
  return `${tag}${String(len).padStart(2, '0')}${value}`;
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) — VietQR / EMVCo. */
export function crc16CcittFalse(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function normalizeVndAmount(amount: string | number): number | null {
  const n =
    typeof amount === 'number' ? amount : Number(String(amount).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/**
 * Build a dynamic VietQR transfer payload (QRIBFTTA).
 * Returns null when required fields are missing or BIN cannot be resolved safely.
 */
export function buildVietQrPayload(input: VietQrBuildInput): string | null {
  const account = String(input.accountNumber ?? '').replace(/\s+/g, '').trim();
  if (!/^\d{6,19}$/.test(account)) return null;

  const bin = resolveNapasBin(input.bankCode, input.bankName);
  if (!bin) return null;

  const amountInt = normalizeVndAmount(input.amount);
  if (amountInt == null) return null;

  // NAPAS purpose (tag 62.08) is commonly capped at 25 chars. Never truncate —
  // a shortened memo could break MegaPay VA matching.
  const addInfo = String(input.addInfo ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!addInfo || addInfo.length > 25) return null;

  try {
    const beneficiary = tlv('00', bin) + tlv('01', account);
    const merchantInfo =
      tlv('00', 'A000000727') + tlv('01', beneficiary) + tlv('02', 'QRIBFTTA');

    let payload =
      tlv('00', '01') +
      tlv('01', '12') +
      tlv('38', merchantInfo) +
      tlv('53', '704') +
      tlv('54', String(amountInt)) +
      tlv('58', 'VN') +
      tlv('62', tlv('08', addInfo));

    payload += '6304';
    return payload + crc16CcittFalse(payload);
  } catch {
    return null;
  }
}
