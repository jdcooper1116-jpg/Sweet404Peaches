'use client';

import { useCallback, useEffect, useState } from 'react';

interface EngineStatus {
  is_current:     boolean;
  last_run_at:    string | null;
  success_count?: number;
  failure_count?: number;
  has_errors:     boolean;
  error?:         string;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m    = Math.floor(diff / 60_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function EngineStatusBadge({ pollMs = 5 * 60_000 }: { pollMs?: number }) {
  const [status,   setStatus]   = useState<EngineStatus | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    try {
      const res  = await fetch('/api/engine/status', { cache: 'no-store' });
      setStatus((await res.json()) as EngineStatus);
    } catch {
      setStatus({ is_current: false, last_run_at: null, has_errors: true, error: 'Unreachable' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    check();
    const id = setInterval(check, pollMs);
    return () => clearInterval(id);
  }, [check, pollMs]);

  const dot =
    loading             ? '#6b7280'
    : !status           ? '#6b7280'
    : status.has_errors ? '#f87171'
    : status.is_current ? '#34d399'
    :                     '#fbbf24';

  const label =
    loading                             ? 'Checking engine…'
    : !status                           ? 'Engine unknown'
    : status.has_errors && status.error ? `Engine error: ${status.error}`
    : status.last_run_at                ? `Engine refreshed ${relativeTime(status.last_run_at)}`
    :                                     'Engine: no ingest data';

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      padding: '6px 12px', borderRadius: '8px',
      background: 'rgba(255,255,255,0.05)',
      border: `1px solid ${dot}44`,
      fontSize: '12px', color: 'rgba(234,234,242,0.75)',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0, display: 'inline-block' }} />
      <span>{label}</span>
      {status && !status.has_errors && (status.success_count ?? 0) > 0 && (
        <span style={{ opacity: 0.5 }}>
          {status.success_count} ok
          {(status.failure_count ?? 0) > 0 &&
            <span style={{ color: '#f87171', marginLeft: 4 }}>{status.failure_count} failed</span>
          }
        </span>
      )}
      <button
        onClick={async () => { setChecking(true); await check(); setChecking(false); }}
        disabled={checking}
        style={{
          padding: '2px 8px', borderRadius: 4,
          border: '1px solid rgba(255,255,255,0.15)',
          background: 'transparent', color: 'rgba(234,234,242,0.55)',
          fontSize: 11, cursor: checking ? 'default' : 'pointer',
          opacity: checking ? 0.5 : 1,
        }}
      >{checking ? '…' : 'Check'}</button>
    </div>
  );
}