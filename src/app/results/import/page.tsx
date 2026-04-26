'use client';
import { useCallback, useEffect, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';

type IngestEntry = {
  state: string;
  game_type: string;
  status: string;
  records_inserted?: number;
  error?: string;
};

type EngineStatus = {
  is_current: boolean;
  last_run_at: string | null;
  success_count: number;
  failure_count: number;
  skipped_count: number;
  has_errors: boolean;
  raw?: {
    status?: {
      started_at?: string;
      finished_at?: string;
      window_start?: string;
      window_end?: string;
      pair_count?: number;
      failure_count?: number;
      results?: IngestEntry[];
    };
  };
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m    = Math.floor(diff / 60_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m} minute${m !== 1 ? 's' : ''} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h !== 1 ? 's' : ''} ago`;
  return `${Math.floor(h / 24)} day${Math.floor(h / 24) !== 1 ? 's' : ''} ago`;
}

export default function ResultsImportPage() {
  const { user }                            = useAuth();
  const [status,     setStatus]             = useState<EngineStatus | null>(null);
  const [statusLoad, setStatusLoad]         = useState(true);
  const [statusError, setStatusError]       = useState('');
  const [refreshing, setRefreshing]         = useState(false);
  const [refreshResult, setRefreshResult]   = useState<string | null>(null);
  const [refreshError, setRefreshError]     = useState('');
  const [showAll,    setShowAll]            = useState(false);

  const loadStatus = useCallback(async () => {
    setStatusLoad(true); setStatusError('');
    try {
      const res  = await fetch('/api/engine/status', { cache: 'no-store' });
      const data = await res.json() as EngineStatus;
      setStatus(data);
    } catch {
      setStatusError('Could not reach engine status endpoint.');
    } finally {
      setStatusLoad(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  async function handleRefreshDreams() {
    if (!user) return;
    setRefreshing(true); setRefreshResult(null); setRefreshError('');
    try {
      const res  = await fetch('/api/dreams/refresh', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ownerUid: user.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Refresh failed.');
      setRefreshResult(
        data.totalNewHits > 0
          ? `${data.totalNewHits} new hit${data.totalNewHits !== 1 ? 's' : ''} found across ${data.windowsChecked} windows.`
          : `${data.windowsChecked} window${data.windowsChecked !== 1 ? 's' : ''} checked — no new hits.`
      );
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : 'Refresh failed.');
    } finally {
      setRefreshing(false);
    }
  }

  const ingestResults: IngestEntry[] = status?.raw?.status?.results ?? [];
  const failed   = ingestResults.filter(r => r.status === 'failed');
  const success  = ingestResults.filter(r => r.status === 'success');
  const skipped  = ingestResults.filter(r => r.status === 'skipped');
  const visible  = showAll ? ingestResults : ingestResults.slice(0, 12);

  const dotColor = !status ? '#6b7280'
    : status.has_errors   ? '#f87171'
    : status.is_current   ? '#34d399'
    :                        '#fbbf24';

  return (
    <main style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '280px 1fr', background: 'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)' }}>
      <Sidebar />
      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>

        {/* Header */}
        <section className="journal-card">
          <div className="page-header">
            <h1>Engine Coverage Audit</h1>
            <p>
              The Railway lottery-engine is the source of truth for all draw results.
              This page shows ingest coverage status and lets you trigger a dream window refresh
              against the latest engine data.
            </p>
          </div>
        </section>

        {/* Engine status card */}
        <section className="journal-card" style={{ display: 'grid', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
              <strong style={{ fontSize: '16px' }}>
                {statusLoad ? 'Checking engine...'
                  : status?.has_errors ? 'Engine has errors'
                  : status?.is_current ? 'Engine is current'
                  : 'Engine status unknown'}
              </strong>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={loadStatus}
              disabled={statusLoad}
            >
              {statusLoad ? 'Checking...' : 'Refresh Status'}
            </button>
          </div>

          {statusError && (
            <div className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>
              {statusError}
            </div>
          )}

          {status && !statusLoad && (
            <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              <div>
                <div className="journal-label">Last Ingest</div>
                <div style={{ fontWeight: 600 }}>
                  {status.last_run_at ? relativeTime(status.last_run_at) : '—'}
                </div>
                {status.last_run_at && (
                  <div style={{ fontSize: '12px', color: 'var(--ink-light)', marginTop: '2px' }}>
                    {new Date(status.last_run_at).toLocaleString()}
                  </div>
                )}
              </div>
              <div>
                <div className="journal-label">Pairs Covered</div>
                <div style={{ fontWeight: 700, fontSize: '22px' }}>
                  {status.raw?.status?.pair_count ?? status.success_count}
                </div>
              </div>
              <div>
                <div className="journal-label">Succeeded</div>
                <div style={{ fontWeight: 700, fontSize: '22px', color: '#4a7c59' }}>
                  {success.length || status.success_count}
                </div>
              </div>
              <div>
                <div className="journal-label">Failed</div>
                <div style={{ fontWeight: 700, fontSize: '22px', color: failed.length > 0 ? '#c0392b' : 'inherit' }}>
                  {failed.length || status.failure_count}
                </div>
              </div>
              <div>
                <div className="journal-label">Skipped</div>
                <div style={{ fontWeight: 700, fontSize: '22px' }}>
                  {skipped.length || status.skipped_count}
                </div>
              </div>
              {status.raw?.status?.window_start && (
                <div>
                  <div className="journal-label">Ingest Window</div>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>
                    {status.raw.status.window_start} → {status.raw.status.window_end}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Dream refresh trigger */}
        <section className="journal-card" style={{ display: 'grid', gap: '16px' }}>
          <div>
            <strong style={{ fontSize: '15px' }}>Run Dream Window Refresh</strong>
            <p style={{ margin: '6px 0 0', color: 'var(--ink-light)', fontSize: '14px' }}>
              Check all active dream windows against the latest engine results and write any new confirmed hits.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleRefreshDreams}
              disabled={refreshing || !user}
            >
              {refreshing ? 'Refreshing windows...' : 'Refresh Dream Windows Now'}
            </button>
            {refreshResult && (
              <span style={{ fontSize: '14px', color: '#4a7c59', fontWeight: 600 }}>
                ✓ {refreshResult}
              </span>
            )}
          </div>
          {refreshError && (
            <div className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>
              {refreshError}
            </div>
          )}
        </section>

        {/* Pair-level coverage table */}
        {ingestResults.length > 0 && (
          <section className="journal-card" style={{ display: 'grid', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '15px' }}>
                Last Ingest — State / Game Coverage ({ingestResults.length} pairs)
              </strong>
              {failed.length > 0 && (
                <span style={{ fontSize: '13px', color: '#c0392b', fontWeight: 600 }}>
                  ⚠ {failed.length} pair{failed.length !== 1 ? 's' : ''} failed
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gap: '6px' }}>
              {visible.map((entry, idx) => (
                <div
                  key={`${entry.state}-${entry.game_type}-${idx}`}
                  className="journal-card-flat"
                  style={{
                    padding: '10px 14px',
                    display: 'grid',
                    gap: '10px',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    alignItems: 'center',
                    borderColor: entry.status === 'failed' ? '#e9c2c2' : undefined,
                  }}
                >
                  <div>
                    <div className="journal-label">State</div>
                    <div style={{ fontWeight: 700 }}>{entry.state}</div>
                  </div>
                  <div>
                    <div className="journal-label">Game</div>
                    <div>{entry.game_type === 'pick3' ? 'Pick 3' : 'Pick 4'}</div>
                  </div>
                  <div>
                    <div className="journal-label">Status</div>
                    <div style={{
                      fontWeight: 600,
                      color: entry.status === 'success' ? '#4a7c59'
                           : entry.status === 'failed'  ? '#c0392b'
                           : '#888',
                    }}>
                      {entry.status === 'success' ? '✓ Success'
                       : entry.status === 'failed' ? '✗ Failed'
                       : entry.status}
                    </div>
                  </div>
                  {typeof entry.records_inserted === 'number' && (
                    <div>
                      <div className="journal-label">Records</div>
                      <div>{entry.records_inserted}</div>
                    </div>
                  )}
                  {entry.error && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div className="journal-label">Error</div>
                      <div style={{ fontSize: '12px', color: '#c0392b' }}>{entry.error}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {ingestResults.length > 12 && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowAll(v => !v)}
              >
                {showAll ? 'Show less' : `Show all ${ingestResults.length} pairs`}
              </button>
            )}
          </section>
        )}

      </section>
    </main>
  );
}
