'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/lib/contexts/AuthContext';
import {
  listDreamHits,
  listPersonalHitMappings,
} from '@/lib/firebase/firestore';

type DreamHitRow = {
  id: string;
  dreamerName?: string;
  termLabel?: string;
  number?: string;
  gameType?: 'cash3' | 'cash4';
  state?: string;
  drawDate?: string;
  drawTime?: string;
  hitType?: 'straight' | 'boxed';
  rawResult?: string;
  normalizedResult?: string;
  daysFromDream?: number;
  sameDay?: boolean;
};

type PersonalMappingRow = {
  id: string;
  termLabel?: string;
  number?: string;
  state?: string;
  hitCount?: number;
};

export default function HitsPage() {
  const { user } = useAuth();
  const [hits, setHits] = useState<DreamHitRow[]>([]);
  const [mappings, setMappings] = useState<PersonalMappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) {
        setHits([]);
        setMappings([]);
        setLoading(false);
        return;
      }

      try {
        const [hitRows, mappingRows] = await Promise.all([
          listDreamHits(user.uid),
          listPersonalHitMappings(user.uid),
        ]);

        setHits(hitRows as DreamHitRow[]);
        setMappings(mappingRows as PersonalMappingRow[]);
      } catch (err) {
        console.error(err);
        setError('Could not load hits.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [user]);

  const sortedHits = useMemo(() => {
    return [...hits].sort((a, b) => {
      const aKey = `${a.drawDate ?? ''} ${a.drawTime ?? ''}`;
      const bKey = `${b.drawDate ?? ''} ${b.drawTime ?? ''}`;
      return aKey < bKey ? 1 : -1;
    });
  }, [hits]);

  const straightCount = sortedHits.filter(h => h.hitType === 'straight').length;
  const boxedCount = sortedHits.filter(h => h.hitType === 'boxed').length;

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
              <h1>Hits Detector</h1>
              <p>
                This page shows raw dream-hit event rows from the detector.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/fell-before" className="btn-secondary">
                As They Fell Before
              </Link>
              <Link href="/windows" className="btn-secondary">
                Active Windows
              </Link>
            </div>
          </div>
        </section>

        <section
          className="journal-card-flat"
          style={{
            display: 'grid',
            gap: '12px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          }}
        >
          <div>
            <div className="journal-label">Dream Hit Events</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{sortedHits.length}</div>
          </div>

          <div>
            <div className="journal-label">Straight Hits</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{straightCount}</div>
          </div>

          <div>
            <div className="journal-label">Boxed Hits</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{boxedCount}</div>
          </div>

          <div>
            <div className="journal-label">Dictionary Rows</div>
            <div style={{ fontSize: '28px', fontWeight: 700 }}>{mappings.length}</div>
          </div>
        </section>

        {loading ? (
          <section className="journal-card">
            <p>Loading hits...</p>
          </section>
        ) : null}

        {error ? (
          <section
            className="journal-card-flat"
            style={{
              borderColor: '#e9c2c2',
              background: '#fff4f4',
              color: '#8a2f2f',
            }}
          >
            {error}
          </section>
        ) : null}

        {!loading && !sortedHits.length && mappings.length > 0 ? (
          <section
            className="journal-card-flat"
            style={{
              borderColor: '#ead9a3',
              background: '#fff9e9',
              color: '#6b5b1f',
            }}
          >
            The dictionary has matches, but no raw dream-hit event rows were found in
            <strong> dreamHits</strong>. That means the hit engine is partially working,
            but the event log layer still needs attention.
          </section>
        ) : null}

        {!loading && !sortedHits.length && !mappings.length ? (
          <section className="journal-card">
            <p>No hit events found yet.</p>
          </section>
        ) : null}

        {sortedHits.length ? (
          <section style={{ display: 'grid', gap: '16px' }}>
            {sortedHits.map(hit => (
              <section key={hit.id} className="journal-card" style={{ display: 'grid', gap: '12px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '16px',
                    flexWrap: 'wrap',
                    alignItems: 'flex-start',
                  }}
                >
                  <div>
                    <h2 style={{ margin: 0 }}>
                      {hit.number || 'Unknown Number'} • {hit.state || 'Unknown State'}
                    </h2>
                    <div style={{ marginTop: '6px', color: 'var(--ink-light)', fontSize: '14px' }}>
                      {hit.drawDate || 'Unknown Date'} • {hit.drawTime || 'Unknown Draw Time'}
                    </div>
                  </div>

                  <div
                    className="journal-card-flat"
                    style={{
                      minWidth: '180px',
                      display: 'grid',
                      gap: '6px',
                    }}
                  >
                    <div><strong>Hit Type:</strong> {hit.hitType || 'Unknown'}</div>
                    <div><strong>Game:</strong> {hit.gameType || 'Unknown'}</div>
                    <div><strong>Result:</strong> {hit.normalizedResult || hit.rawResult || 'Unknown'}</div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gap: '10px',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  }}
                >
                  <div className="journal-card-flat">
                    <strong>Dreamer</strong>
                    <p style={{ marginTop: '8px', color: 'var(--ink-light)' }}>
                      {hit.dreamerName || 'Unknown'}
                    </p>
                  </div>

                  <div className="journal-card-flat">
                    <strong>Mapped Term</strong>
                    <p style={{ marginTop: '8px', color: 'var(--ink-light)' }}>
                      {hit.termLabel || 'Unknown'}
                    </p>
                  </div>

                  <div className="journal-card-flat">
                    <strong>Days From Dream</strong>
                    <p style={{ marginTop: '8px', color: 'var(--ink-light)' }}>
                      {typeof hit.daysFromDream === 'number' ? hit.daysFromDream : 'Unknown'}
                      {hit.sameDay ? ' • Same Day' : ''}
                    </p>
                  </div>
                </div>
              </section>
            ))}
          </section>
        ) : null}
      </section>
    </main>
  );
}
