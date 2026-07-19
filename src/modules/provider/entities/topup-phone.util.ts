import { BadRequestException } from '@nestjs/common';

const PHONE_NOTE_PATTERN = /Nạp số:\s*(\d{9,11})/i;

export function normalizeTopupPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length >= 11) {
    return `0${digits.slice(2)}`;
  }
  if (digits.startsWith('0') && digits.length >= 10) {
    return digits.slice(0, 11);
  }
  throw new BadRequestException('Invalid topup phone number');
}

export function resolveTopupPhone(order: {
  guestPhone?: string | null;
  customerNote?: string | null;
}): string {
  if (order.guestPhone?.trim()) {
    return normalizeTopupPhone(order.guestPhone.trim());
  }
  const noteMatch = order.customerNote?.match(PHONE_NOTE_PATTERN);
  if (noteMatch?.[1]) {
    return normalizeTopupPhone(noteMatch[1]);
  }
  throw new BadRequestException('Topup phone number not found on order');
}

export function formatTelcoLabel(telco: string): string {
  const key = telco.toLowerCase();
  const labels: Record<string, string> = {
    viettel: 'Viettel',
    mobi: 'Mobifone',
    mobifone: 'Mobifone',
    vina: 'Vinaphone',
    vinaphone: 'Vinaphone',
    vietnamobile: 'Vietnamobile',
    gmobile: 'Gmobile',
  };
  return labels[key] ?? telco;
}
