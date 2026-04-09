'use client';

import { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { fullResetOwnerData } from '@/lib/firebase/firestore';

export default function CleanupPage() {
  const { user } = useAuth();
  const [confirmText, setConfirmText] = useState('');
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [report, setReport] = useState<Record<string, number> | null>(null);

  async function handleFullReset() {
    if (!user) {
      setError('You must be signed in.');
      return;
    }

    if (confirmText.trim() !== 'DELETE ALL APP DATA') {
      setError('Type DELETE ALL APP DATA exactly to continue.');
      return;
    }

    setRunning(true);
    setError('');
    setMessage('');
    setReport(null);

    try {
      const result = await fullResetOwnerData(user.uid);
      setReport(result);
      setMessage('Full reset complete. All Firestore app data for this account was deleted.');
      setConfirmText('');
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Full reset failed.';
      setError(msg);
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
          'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)',
      }}
    >
      <Sidebar />

      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>
        <section className="journal-card">
          <div className="page-header">
            <h1>Full System Reset</h1>
            <p>
              This deletes all Firestore app data for your account so you can test from a true blank slate.
            </p>
          </div>
        </section>

        <section className="journal-card" style={{ display: 'grid', gap: '16px' }}>
          <div className="journal-card-flat">
            <strong>This will delete everything in the app data layer</strong>
            <p style={{ marginTop: '10px', color: 'var(--ink-light)' }}>
              Dreams, dreamers, active windows, uploaded results, hit logs, pinned plays,
              As They Fell Before memory, universal dictionary mappings, and owner profile data.
            </p>
          </div>

          <div>
            <label className="journal-label" htmlFor="confirmReset">
              Type exactly: DELETE ALL APP DATA
            </label>
            <input
              id="confirmReset"
              className="journal-input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE ALL APP DATA"
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleFullReset}
              disabled={running}
            >
              {running ? 'Resetting...' : 'Run Full Reset'}
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

          {report ? (
            <section className="journal-card-flat" style={{ display: 'grid', gap: '8px' }}>
              <strong>Deleted counts</strong>
              {Object.entries(report).map(([key, value]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span>{key}</span>
                  <span style={{ fontWeight: 700 }}>{value}</span>
                </div>
              ))}
            </section>
          ) : null}
        </section>
      </section>
    </main>
  );
}
