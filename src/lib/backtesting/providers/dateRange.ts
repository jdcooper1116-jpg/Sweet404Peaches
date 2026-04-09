export function toIsoDate(input: Date | string) {
  const d = typeof input === 'string' ? new Date(`${input}T00:00:00`) : input;
  return d.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, offset: number) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + offset);
  return toIsoDate(d);
}

export function buildSevenDayWindow(startDate: string) {
  return Array.from({ length: 7 }, (_, i) => addDays(startDate, i));
}

export function extractYear(isoDate: string) {
  return isoDate.slice(0, 4);
}

export function humanDateParts(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00`);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  const day = d.getDate();
  const year = d.getFullYear();
  return { weekday, month, day, year };
}
