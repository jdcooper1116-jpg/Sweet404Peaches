'use client';

import { useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { rescanLotteryResultsForDateRange } from '@/lib/firebase/firestore';

function isoDate(daysOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

export default function ResultsRescanPage() {
  const { user } = useAuth();
  const [startDate, setStartDate] = useState(isoDate(-7));
  const [endDate, setEndDate] = useState(isoDate(0));
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const label = useMemo(() => `${startDate} → ${endDate}`, [startDate, endDate]);

  async function handleRescan() {
    if (!user) {
      setError('You must be signed in.');
      return;
    }

    setRunning(true);
    setError('');
    setMessage('');

    try {
      const count = await rescanLotteryResultsForDateRange(user.uid, startDate, endDate);
      setMessage(`Rescanned ${count} result row(s) for ${label}. Straight and boxed hits were re-checked and logged.`);
    } catch (err) {
      console.error(err);
      setError('Rescan failed. Check Firestore permissions and console logs.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        background:
          'radial-gradient(circle at top, rgba(232,197,71,0.10), transparent 30%), linear-gradient(135deg, var(--cream) 0%, var(--parchment) 50%, var(--parchment-deep) 100%)',
      }}
    >
      <Sidebar />

      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>
        <section className="journal-card">
          <div className="page-header">
            <h1>Rescan Results for Hits</h1>
            <p>
              Re-check existing uploaded results against active 7-day dream windows and write any missing straight or boxed hits into the system.
            </p>
          </div>
        </section>

        <section className="journal-card" style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label className="journal-label" htmlFor="startDate">Start Date</label>
            <input
              id="startDate"
              type="date"
              className="journal-input"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>

          <div>
            <label className="journal-label" htmlFor="endDate">End Date</label>
            <input
              id="endDate"
              type="date"
              className="journal-input"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleRescan}
              disabled={running}
            >
              {running ? 'Rescanning...' : 'Rescan Results'}
            </button>
          </div>

          {message ? (
            <div
              className="journal-card-flat"
              style={{
                borderColor: '#cfe5c8',
                background: '#f5fbf2',
                color: '#315a2b',
              }}
            >
              {message}
            </div>
          ) : null}

          {error ? (
            <div
              className="journal-card-flat"
              style={{
                borderColor: '#e9c2c2',
                background: '#fff4f4',
                color: '#8a2f2f',
              }}
            >
              {error}
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
