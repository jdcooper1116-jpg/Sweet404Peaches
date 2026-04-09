import type { AutoFetchGameType } from './types';

export function digitsOnly(value: string) {
  return String(value ?? '').replace(/\D/g, '');
}

export function boxedKey(value: string) {
  return digitsOnly(value).split('').sort().join('');
}

export function normalizeResult(raw: string, gameType: AutoFetchGameType) {
  const digits = digitsOnly(raw);
  if (gameType === 'cash3' && digits.length === 3) return digits;
  if (gameType === 'cash4' && digits.length === 4) return digits;
  return '';
}
