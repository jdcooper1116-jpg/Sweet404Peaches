// @ts-nocheck
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  getOwnerIntegritySnapshot,
  listActiveDreamWindows,
  listBacktestDreams,
  listAllBacktestHits,
  listDreamHits,
  listPersonalHitMappings,
  safeResetLiveOpsData,
  safeResetResearchData,
  hardResetOperationalData,
} from '@/lib/firebase/firestore';
import { buildIntegrityAudit } from '@/lib/intelligence/dataIntegrity';

export default function IntegrityPage() {
  const { user } = useAuth();

  const [snapshot, setSnapshot] = useState<any | null>(null);
  const [activeWindows, setActiveWindows] = useState<any[]>([]);
  const [dreamHits, setDreamHits] = useState<any[]>([]);
  const [personalRows, setPersonalRows] = useState<any[]>([]);
  const [backtestDreams, setBacktestDreams] = useState<any[]>([]);
  const [backtestHits, setBacktestHits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function loadAll() {
    if (!user) {
      setSnapshot(null);
      setActiveWindows([]);
      setDreamHits([]);
      setPersonalRows([]);
      setBacktestDreams([]);
      setBacktestHits([]);
      setLoading(false);
      return;
    }

    try {
      const [
        integritySnapshot,
        windows,
        hits,
        personal,
        researchDreams,
        researchHits,
      ] = await Promise.all([
        getOwnerIntegritySnapshot(user.uid),
        listActiveDreamWindows(user.uid),
        listDreamHits(user.uid),
        listPersonalHitMappings(user.uid),
        listBacktestDreams(user.uid),
        listAllBacktestHits(user.uid),
      ]);

      setSnapshot(integritySnapshot);
      setActiveWindows(windows);
      setDreamHits(hits);
      setPersonalRows(personal);
      setBacktestDreams(researchDreams);
      setBacktestHits(researchHits);
    } catch (err) {
      console.error(err);
      setError('Could not load Integrity Console.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [user]);

  const audit = useMemo(
    () =>
      buildIntegrityAudit({
        activeWindows,
        dreamHits,
        personalRows,
        backtestDreams,
        backtestHits,
      }),
    [activeWindows, dreamHits, personalRows, backtestDreams, backtestHits]
  );

  async function runReset(kind: 'live' | 'research' | 'hard') {
    if (!user) return;

    const confirmText =
      kind === 'hard'
        ? 'This will remove live + research operational data while preserving dictionaries. Continue?'
        : kind === 'live'
        ? 'This will remove live operational data while preserving dictionaries. Continue?'
        : 'This will remove research/backtesting data while preserving dictionaries. Continue?';

    if (!window.confirm(confirmText)) return;

    setWorking(true);
    setError('');
    setMessage('');

    try {
      const result =
        kind === 'live'
          ? await safeResetLiveOpsData(user.uid)
          : kind === 'research'
          ? await safeResetResearchData(user.uid)
          : await hardResetOperationalData(user.uid);

      setMessage(`Reset complete: ${JSON.stringify(result)}`);
      await loadAll();
    } catch (err) {
      console.error(err);
      setError('Reset failed.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        background:
          'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)',
      }}
    >
      <Sidebar />
      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>
        <section className="journal-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '16px',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
            }}
          >
            <div className="page-header">
              <h1>Integrity Console</h1>
              <p>
                Audit duplicates, orphan records, weak research records, and run safe resets.
                Dictionaries are preserved by reset tools.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/daily-ops" className="btn-secondary">Daily Ops</Link>
              <Link href="/backtesting/evidence" className="btn-secondary">Evidence Rules</Link>
              <Link href="/performance" className="btn-secondary">Performance</Link>
            </div>
          </div>
        </section>

        {loading ? (
          <section className="journal-card"><p>Loading Integrity Console...</p></section>
        ) : null}

        {error ? (
          <section className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>
            {error}
          </section>
        ) : null}

        {message ? (
          <section className="journal-card-flat" style={{ borderColor: '#cfe5c8', background: '#f5fbf2', color: '#315a2b' }}>
            {message}
          </section>
        ) : null}

        <section
          className="journal-card-flat"
          style={{
            display: 'grid',
            gap: '12px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          {snapshot ? Object.entries(snapshot).map(([key, value]) => (
            <div key={key}>
              <div className="journal-label">{key}</div>
              <div style={{ fontSize: '24px', fontWeight: 700 }}>{String(value)}</div>
            </div>
          )) : null}
        </section>

        <section className="journal-card">
          <div className="page-header">
            <h1>Audit Summary</h1>
            <p>Quick integrity counts across live and research memory.</p>
          </div>

          <div
            style={{
              display: 'grid',
              gap: '12px',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              marginTop: '12px',
            }}
          >
            {Object.entries(audit.summary).map(([key, value]) => (
              <div key={key} className="journal-card-flat">
                <div className="journal-label">{key}</div>
                <div style={{ fontSize: '24px', fontWeight: 700 }}>{String(value)}</div>
              </div>
            ))}
          </div>
        </section>

        <section
          style={{
            display: 'grid',
            gap: '24px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          }}
        >
          <section className="journal-card">
            <div className="page-header">
              <h1>Duplicates</h1>
              <p>Most important duplicate patterns.</p>
            </div>

            <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
              {audit.duplicateLiveHits.slice(0, 5).map((row: any) => (
                <div key={row.key} className="journal-card-flat">Live hit duplicate ×{row.count}</div>
              ))}
              {audit.duplicatePersonalMappings.slice(0, 5).map((row: any) => (
                <div key={row.key} className="journal-card-flat">Personal mapping duplicate ×{row.count}</div>
              ))}
              {audit.duplicateBacktestHits.slice(0, 5).map((row: any) => (
                <div key={row.key} className="journal-card-flat">Backtest hit duplicate ×{row.count}</div>
              ))}
              {!audit.duplicateLiveHits.length &&
              !audit.duplicatePersonalMappings.length &&
              !audit.duplicateBacktestHits.length ? (
                <p>No duplicate groups detected.</p>
              ) : null}
            </div>
          </section>

          <section className="journal-card">
            <div className="page-header">
              <h1>Orphans / Weak Records</h1>
              <p>Records missing expected links or parsed content.</p>
            </div>

            <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
              <div className="journal-card-flat">Orphan Active Windows: {audit.orphanActiveWindows.length}</div>
              <div className="journal-card-flat">Orphan Dream Hits: {audit.orphanDreamHits.length}</div>
              <div className="journal-card-flat">Orphan Backtest Hits: {audit.orphanBacktestHits.length}</div>
              <div className="journal-card-flat">Weak Backtest Dreams: {audit.weakBacktestDreams.length}</div>
            </div>
          </section>
        </section>

        <section className="journal-card">
          <div className="page-header">
            <h1>Safe Reset Tools</h1>
            <p>
              These resets preserve dictionaries by design:
              personalHitMappings and termNumberMappings are not deleted.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '12px' }}>
            <button className="btn-secondary" disabled={working} onClick={() => runReset('live')}>
              {working ? 'Working...' : 'Reset Live Ops'}
            </button>
            <button className="btn-secondary" disabled={working} onClick={() => runReset('research')}>
              {working ? 'Working...' : 'Reset Research'}
            </button>
            <button className="btn-primary" disabled={working} onClick={() => runReset('hard')}>
              {working ? 'Working...' : 'Hard Operational Reset'}
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}
