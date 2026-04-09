export type AutoFetchGameType = 'cash3' | 'cash4';

export type AutoFetchRow = {
  state: string;
  gameType: AutoFetchGameType;
  drawDate: string; // YYYY-MM-DD
  drawTime: 'Midday' | 'Evening' | 'Night';
  result: string; // digits only, leading zeroes preserved
  boxedKey: string; // sorted digits
  sourceProvider: string;
  sourceUrl: string;
  gameLabel?: string;
  bonusText?: string;
};

export type ProviderAttempt = {
  provider: string;
  ok: boolean;
  count: number;
  message: string;
};

export type ProviderFetchResult = {
  rows: AutoFetchRow[];
  attempts: ProviderAttempt[];
};
