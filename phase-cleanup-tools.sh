#!/usr/bin/env bash
set -euo pipefail

cd ~/sweet404peaces

python3 - <<'PY'
from pathlib import Path

# -----------------------------
# Patch firestore.ts
# -----------------------------
firestore_path = Path("src/lib/firebase/firestore.ts")
text = firestore_path.read_text()

if "  deleteDoc," not in text and "import {" in text:
    text = text.replace("  addDoc,\n", "  addDoc,\n  deleteDoc,\n")

if "export async function deleteDreamEntryCascade" not in text:
    text += """

export async function deleteDreamEntryCascade(dreamEntryId: string) {
  const batch = writeBatch(db);

  const dreamRef = doc(db, COLLECTIONS.dreamEntries, dreamEntryId);
  batch.delete(dreamRef);

  const windowsSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.activeDreamWindows),
      where('sourceDreamEntryId', '==', dreamEntryId)
    )
  );
  windowsSnap.forEach(d => batch.delete(d.ref));

  const hitsSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.dreamHits),
      where('sourceDreamEntryId', '==', dreamEntryId)
    )
  );
  hitsSnap.forEach(d => batch.delete(d.ref));

  await batch.commit();
}

export async function deleteDreamerCascade(dreamerId: string) {
  const batch = writeBatch(db);

  const dreamerRef = doc(db, COLLECTIONS.dreamers, dreamerId);
  batch.delete(dreamerRef);

  const dreamsSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.dreamEntries),
      where('dreamerId', '==', dreamerId)
    )
  );
  dreamsSnap.forEach(d => batch.delete(d.ref));

  const windowsSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.activeDreamWindows),
      where('dreamerId', '==', dreamerId)
    )
  );
  windowsSnap.forEach(d => batch.delete(d.ref));

  const hitsSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.dreamHits),
      where('dreamerId', '==', dreamerId)
    )
  );
  hitsSnap.forEach(d => batch.delete(d.ref));

  const personalSnap = await getDocs(
    query(
      collection(db, COLLECTIONS.personalHitMappings),
      where('dreamerId', '==', dreamerId)
    )
  );
  personalSnap.forEach(d => batch.delete(d.ref));

  await batch.commit();
}
"""
firestore_path.write_text(text)

# -----------------------------
# Create cleanup page
# -----------------------------
cleanup_dir = Path("src/app/cleanup")
cleanup_dir.mkdir(parents=True, exist_ok=True)

cleanup_page = cleanup_dir / "page.tsx"
cleanup_page.write_text("""'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Sparkles, Trash2 } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  deleteDreamEntryCascade,
  deleteDreamerCascade,
  listDreamEntries,
  listDreamers,
} from '@/lib/firebase/firestore';

function formatDate(value: any) {
  try {
    if (!value) return '—';
    if (typeof value === 'string') return value;
    if (value?.toDate) return value.toDate().toLocaleString();
    return String(value);
  } catch {
    return '—';
  }
}

export default function CleanupPage() {
  const { user, loading } = useAuth();

  const [dreams, setDreams] = useState<any[]>([]);
  const [dreamers, setDreamers] = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [dreamSearch, setDreamSearch] = useState('');
  const [dreamerSearch, setDreamerSearch] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function refresh() {
    if (!user) return;

    const [dreamRows, dreamerRows] = await Promise.all([
      listDreamEntries(user.uid),
      listDreamers(user.uid),
    ]);

    setDreams(dreamRows);
    setDreamers(dreamerRows);
  }

  useEffect(() => {
    async function load() {
      if (!user) {
        setDreams([]);
        setDreamers([]);
        setPageLoading(false);
        return;
      }

      try {
        setError('');
        await refresh();
      } catch (err) {
        console.error(err);
        setError('Could not load cleanup data.');
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) {
      void load();
    }
  }, [user, loading]);

  const filteredDreams = useMemo(() => {
    const q = dreamSearch.trim().toLowerCase();
    if (!q) return dreams;

    return dreams.filter((dream: any) => {
      const text = [
        dream.dreamerName,
        dream.dreamDate,
        dream.dreamText,
        dream.rawText,
        dream.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return text.includes(q);
    });
  }, [dreams, dreamSearch]);

  const filteredDreamers = useMemo(() => {
    const q = dreamerSearch.trim().toLowerCase();
    if (!q) return dreamers;

    return dreamers.filter((dreamer: any) => {
      const text = [
        dreamer.displayName,
        dreamer.alias,
        dreamer.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return text.includes(q);
    });
  }, [dreamers, dreamerSearch]);

  async function handleDeleteDream(dream: any) {
    if (!user) return;

    const ok = window.confirm(
      `Delete this dream for ${dream.dreamerName || 'Unknown'}?\\n\\nThis will also remove linked active windows and linked dream hits for this dream.`
    );
    if (!ok) return;

    try {
      setBusyKey(`dream-${dream.id}`);
      setMessage('');
      setError('');
      await deleteDreamEntryCascade(dream.id);
      await refresh();
      setMessage('Dream deleted.');
    } catch (err) {
      console.error(err);
      setError('Could not delete dream.');
    } finally {
      setBusyKey('');
    }
  }

  async function handleDeleteDreamer(dreamer: any) {
    if (!user) return;

    const ok = window.confirm(
      `Delete dreamer "${dreamer.displayName || 'Unknown'}"?\\n\\nThis will also remove linked dreams, active windows, dream hits, and personal hit mappings for this dreamer.`
    );
    if (!ok) return;

    try {
      setBusyKey(`dreamer-${dreamer.id}`);
      setMessage('');
      setError('');
      await deleteDreamerCascade(dreamer.id);
      await refresh();
      setMessage('Dreamer and linked testing data deleted.');
    } catch (err) {
      console.error(err);
      setError('Could not delete dreamer.');
    } finally {
      setBusyKey('');
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
            <h1>Cleanup Tools</h1>
            <p>
              Remove testing dreams and dreamers so the app reflects real data only.
            </p>
          </div>
        </section>

        <section
          className="journal-card-flat"
          style={{
            borderColor: '#ead9ae',
            background: '#fff9eb',
            color: '#6f5620',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={18} />
            <strong>Use with care</strong>
          </div>
          <p style={{ margin: '10px 0 0 0' }}>
            Dream deletion also removes linked active windows and linked dream hits.
            Dreamer deletion also removes linked dreams, active windows, dream hits,
            and personal hit mappings for that dreamer.
          </p>
        </section>

        {message ? (
          <div
            className="journal-card-flat"
            style={{ borderColor: '#cfe5c8', background: '#f5fbf2', color: '#315a2b' }}
          >
            {message}
          </div>
        ) : null}

        {error ? (
          <div
            className="journal-card-flat"
            style={{ borderColor: '#e9c2c2', background: '#fff4f4', color: '#8a2f2f' }}
          >
            {error}
          </div>
        ) : null}

        {pageLoading ? (
          <section className="journal-card">
            <p style={{ margin: 0, color: 'var(--ink-light)' }}>Loading cleanup tools...</p>
          </section>
        ) : (
          <>
            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <Sparkles size={18} />
                <strong>Dream Cleanup</strong>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="journal-label">Search Dreams</label>
                <input
                  className="journal-input"
                  value={dreamSearch}
                  onChange={e => setDreamSearch(e.target.value)}
                  placeholder="Search by dreamer, date, text..."
                />
              </div>

              {filteredDreams.length === 0 ? (
                <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                  No dreams found for this filter.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {filteredDreams.map((dream: any) => (
                    <article key={dream.id} className="journal-card-flat">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, color: 'var(--deep-plum)', marginBottom: '6px' }}>
                            {dream.dreamerName || 'Unknown Dreamer'}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px', marginBottom: '6px' }}>
                            Date: {dream.dreamDate || formatDate(dream.createdAt)}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                            {(dream.dreamText || dream.rawText || '').slice(0, 180) || 'No preview available'}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn-primary"
                          disabled={busyKey === `dream-${dream.id}`}
                          onClick={() => handleDeleteDream(dream)}
                          style={{ background: '#8a2f2f', borderColor: '#8a2f2f' }}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                            <Trash2 size={14} />
                            {busyKey === `dream-${dream.id}` ? 'Deleting...' : 'Delete Dream'}
                          </span>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="journal-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', color: 'var(--deep-plum)' }}>
                <Sparkles size={18} />
                <strong>Dreamer Cleanup</strong>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label className="journal-label">Search Dreamers</label>
                <input
                  className="journal-input"
                  value={dreamerSearch}
                  onChange={e => setDreamerSearch(e.target.value)}
                  placeholder="Search by name or alias..."
                />
              </div>

              {filteredDreamers.length === 0 ? (
                <div className="journal-card-flat" style={{ color: 'var(--ink-light)' }}>
                  No dreamers found for this filter.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '12px' }}>
                  {filteredDreamers.map((dreamer: any) => (
                    <article key={dreamer.id} className="journal-card-flat">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: 'var(--deep-plum)', marginBottom: '6px' }}>
                            {dreamer.displayName || 'Unnamed Dreamer'}
                          </div>
                          <div style={{ color: 'var(--ink-light)', fontSize: '14px' }}>
                            Alias: {dreamer.alias || '—'}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn-primary"
                          disabled={busyKey === `dreamer-${dreamer.id}`}
                          onClick={() => handleDeleteDreamer(dreamer)}
                          style={{ background: '#8a2f2f', borderColor: '#8a2f2f' }}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                            <Trash2 size={14} />
                            {busyKey === `dreamer-${dreamer.id}` ? 'Deleting...' : 'Delete Dreamer'}
                          </span>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
""")

# -----------------------------
# Patch Sidebar
# -----------------------------
sidebar_path = Path("src/components/layout/Sidebar.tsx")
sidebar_text = sidebar_path.read_text()

if "Trash2," not in sidebar_text:
    sidebar_text = sidebar_text.replace(
        "  Trophy,\n  Users,\n} from 'lucide-react';",
        "  Trophy,\n  Trash2,\n  Users,\n} from 'lucide-react';"
    )

if "/cleanup" not in sidebar_text:
    sidebar_text = sidebar_text.replace(
        "{ href: '/dreamers', label: 'Dreamers', icon: Users },",
        "{ href: '/dreamers', label: 'Dreamers', icon: Users },\n  { href: '/cleanup', label: 'Cleanup', icon: Trash2 },"
    )

sidebar_path.write_text(sidebar_text)

print("Cleanup tools bundle applied.")
PY
