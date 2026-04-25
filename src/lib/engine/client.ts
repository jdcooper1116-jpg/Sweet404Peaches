import type { EngineBacktestRequest, AnyEngineBacktestResponse, EngineIngestStatus } from './types';

function getEngineUrl(): string {
  const url = process.env.LOTTERY_ENGINE_URL;
  if (!url) throw new Error('LOTTERY_ENGINE_URL is not set.');
  return url.replace(/\/$/, '');
}
function getAdminSecret(): string {
  const secret = process.env.LOTTERY_ENGINE_ADMIN_SECRET;
  if (!secret) throw new Error('LOTTERY_ENGINE_ADMIN_SECRET is not set.');
  return secret;
}

async function engineFetch(path: string, init: RequestInit, timeoutMs = 20_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${getEngineUrl()}${path}`, { ...init, cache: 'no-store', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function runBacktest(body: EngineBacktestRequest): Promise<AnyEngineBacktestResponse> {
  const res = await engineFetch('/backtest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Engine backtest failed: HTTP ${res.status} — ${JSON.stringify(data)}`);
  return data as AnyEngineBacktestResponse;
}

export async function getIngestStatus(): Promise<EngineIngestStatus> {
  const res = await engineFetch('/admin/ingest/status', { method: 'GET', headers: { 'Content-Type': 'application/json', 'X-Ingest-Token': getAdminSecret() } });
  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Engine status check failed: HTTP ${res.status} — ${JSON.stringify(data)}`);
  return data as EngineIngestStatus;
}

export async function triggerIngest(): Promise<{ message: string }> {
  const res = await engineFetch('/admin/ingest/recent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Ingest-Token': getAdminSecret() } }, 60_000);
  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`Engine ingest trigger failed: HTTP ${res.status} — ${JSON.stringify(data)}`);
  return data as { message: string };
}
