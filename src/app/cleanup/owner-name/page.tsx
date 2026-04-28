'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { UserCircle2 } from 'lucide-react';

export default function OwnerProfilePage() {
  const { user, loading: authLoading } = useAuth();

  const [displayName,    setDisplayName]    = useState('');
  const [savedName,      setSavedName]      = useState('');
  const [pageLoading,    setPageLoading]    = useState(true);
  const [saving,         setSaving]         = useState(false);
  const [message,        setMessage]        = useState('');
  const [error,          setError]          = useState('');

  // ── Load current profile ────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !user) { setPageLoading(false); return; }
    fetch(`/api/owner-profile?ownerUid=${encodeURIComponent(user.uid)}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setDisplayName(d.profile.displayName ?? '');
          setSavedName(d.profile.displayName ?? '');
        }
      })
      .catch(err => console.error('profile load:', err))
      .finally(() => setPageLoading(false));
  }, [user, authLoading]);

  // ── Save profile ────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!user || !displayName.trim()) return;
    setSaving(true); setMessage(''); setError('');
    try {
      const res  = await fetch('/api/owner-profile', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ownerUid: user.uid, displayName: displayName.trim() }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Save failed');
      setSavedName(data.displayName);
      setMessage('Display name saved.');
    } catch (err) {
      console.error(err);
      setError('Could not save display name.');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px', maxWidth: '560px' }}>

      {/* Header */}
      <section className="journal-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', color: 'var(--aurora-purple)' }}>
          <UserCircle2 size={22} strokeWidth={1.8} />
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.04em', fontFamily: 'system-ui, sans-serif', color: 'var(--aurora-text)' }}>
            Owner Profile
          </h1>
        </div>
        <p style={{ color: 'var(--aurora-text2)', margin: 0, fontSize: '14px', lineHeight: 1.65 }}>
          Set your display name. This replaces "Owner / Self" across Dream Journal, Active Windows,
          As They Fell Before, and all dreamer selectors.
        </p>
      </section>

      {/* Profile form */}
      {pageLoading ? (
        <section className="journal-card">
          <p style={{ margin: 0, color: 'var(--aurora-text2)' }}>Loading profile…</p>
        </section>
      ) : !user ? (
        <section className="journal-card" style={{ borderColor: 'rgba(255,85,85,0.28)', background: 'rgba(255,85,85,0.10)', color: '#ff9090' }}>
          Not signed in.
        </section>
      ) : (
        <section className="journal-card" style={{ display: 'grid', gap: '18px' }}>
          {/* Current */}
          {savedName && (
            <div style={{
              padding: '12px 16px', borderRadius: '14px',
              background: 'rgba(160,144,255,0.10)', border: '1px solid rgba(160,144,255,0.22)',
              fontSize: '13px',
            }}>
              <span style={{ color: 'var(--aurora-text3)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em' }}>
                Current name
              </span>
              <div style={{ color: 'var(--aurora-purple)', fontWeight: 700, fontSize: '16px', marginTop: '4px', letterSpacing: '-0.02em' }}>
                {savedName}
              </div>
            </div>
          )}

          {/* Input */}
          <div>
            <label className="journal-label" htmlFor="ownerDisplayName">
              Display Name
            </label>
            <input
              id="ownerDisplayName"
              className="journal-input"
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleSave(); }}
              placeholder="e.g. Nadia, Grandma Rose, Me"
              maxLength={60}
              autoComplete="off"
            />
            <div style={{ fontSize: '12px', color: 'var(--aurora-text3)', marginTop: '6px' }}>
              This is visible only to you. Internal IDs are unchanged.
            </div>
          </div>

          {/* Save */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={saving || !displayName.trim() || displayName.trim() === savedName}
              style={{ minHeight: '44px', padding: '10px 24px' }}
            >
              {saving ? 'Saving…' : 'Save Display Name'}
            </button>
            {message && <span style={{ color: 'var(--aurora-green)', fontSize: '13px', fontWeight: 600 }}>✓ {message}</span>}
            {error   && <span style={{ color: '#ff9090',             fontSize: '13px' }}>⚠ {error}</span>}
          </div>
        </section>
      )}

      {/* Context note */}
      <section className="journal-card-flat" style={{ fontSize: '13px', color: 'var(--aurora-text3)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--aurora-text2)' }}>Where this appears:</strong>
        <ul style={{ margin: '8px 0 0 18px', padding: 0, display: 'grid', gap: '3px' }}>
          <li>Dream Journal — dreamer name column</li>
          <li>Active Windows — dream owner label</li>
          <li>As They Fell Before — scope label</li>
          <li>Universal Dictionary — dreamer selector</li>
          <li>All dreamer filter dropdowns</li>
        </ul>
      </section>
    </div>
  );
}
