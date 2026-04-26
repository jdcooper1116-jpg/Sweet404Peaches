'use client';
import { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';

export default function CleanupPage() {
  const { user }                          = useAuth();
  const [confirmText, setConfirmText]     = useState('');
  const [running, setRunning]             = useState(false);
  const [message, setMessage]             = useState('');
  const [error, setError]                 = useState('');
  const [report, setReport]               = useState<Record<string, number> | null>(null);

  async function handleFullReset() {
    if (!user) { setError('You must be signed in.'); return; }
    if (confirmText.trim() !== 'DELETE ALL APP DATA') {
      setError('Type DELETE ALL APP DATA exactly to continue.');
      return;
    }
    setRunning(true); setError(''); setMessage(''); setReport(null);
    try {
      const res  = await fetch('/api/admin/reset', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ownerUid: user.uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Reset failed.');
      setReport(data.report);
      setMessage('Full reset complete.');
      setConfirmText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Full reset failed.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '280px 1fr', background: 'radial-gradient(circle at top left, rgba(228,192,123,0.14), transparent 18%), radial-gradient(circle at top right, rgba(108,120,255,0.12), transparent 22%), linear-gradient(135deg, #1A1A2E 0%, #16213E 48%, #0F3460 100%)' }}>
      <Sidebar />
      <section style={{ padding: '32px', display: 'grid', gap: '24px' }}>
        <section className="journal-card">
          <div className="page-header">
            <h1>Full System Reset</h1>
            <p>Deletes all Firestore app data for your account.</p>
          </div>
        </section>
        <section className="journal-card" style={{ display: 'grid', gap: '16px' }}>
          <div className="journal-card-flat">
            <strong>This will delete everything in the app data layer</strong>
            <p style={{ marginTop: '10px', color: 'var(--ink-light)' }}>
              Dreams, dreamers, active windows, hit logs, pinned plays, and backtesting data.
            </p>
          </div>
          <div>
            <label className="journal-label" htmlFor="confirmReset">TYPE EXACTLY: DELETE ALL APP DATA</label>
            <input
              id="confirmReset"
              className="journal-input"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="DELETE ALL APP DATA"
            />
          </div>
          <div>
            <button type="button" className="btn-primary" onClick={handleFullReset} disabled={running}>
              {running ? 'Resetting...' : 'Run Full Reset'}
            </button>
          </div>
          {message && (
            <div className="journal-card-flat" style={{ borderColor: '#cfe5c8', background: '#f5fbf2', color: '#315a2b' }}>
              {message}
            </div>
          )}
          {error && (
            <div className="journal-card-flat" style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}>
              {error}
            </div>
          )}
          {report && (
            <section className="journal-card-flat" style={{ display: 'grid', gap: '8px' }}>
              <strong>Deleted counts</strong>
              {Object.entries(report).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span>{k}</span>
                  <span style={{ fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </section>
          )}
        </section>
      </section>
    </main>
  );
}
