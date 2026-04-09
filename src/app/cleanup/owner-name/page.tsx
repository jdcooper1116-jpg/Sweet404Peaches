'use client';

import { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { migrateOwnerDisplayName } from '@/lib/firebase/firestore';

export default function OwnerNameMigrationPage() {
  const { user } = useAuth();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [report, setReport] = useState<Record<string, number> | null>(null);

  async function handleMigration() {
    if (!user) {
      setError('You must be signed in.');
      return;
    }

    setRunning(true);
    setError('');
    setMessage('');
    setReport(null);

    try {
      const result = await migrateOwnerDisplayName(user.uid, 'Sweet404Peaches');
      setReport(result);
      setMessage('Owner display name migration complete.');
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Migration failed.';
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
            <h1>Owner Name Migration</h1>
            <p>
              This updates old owner labels like Me / Owner Journal to Sweet404Peaches.
            </p>
          </div>
        </section>

        <section className="journal-card" style={{ display: 'grid', gap: '16px' }}>
          <div className="journal-card-flat">
            <strong>Target Name</strong>
            <p style={{ marginTop: '10px', color: 'var(--ink-light)' }}>
              Sweet404Peaches
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={handleMigration}
              disabled={running}
            >
              {running ? 'Migrating...' : 'Run Owner Name Migration'}
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
              <strong>Updated counts</strong>
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
