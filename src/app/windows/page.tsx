'use client';
import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/contexts/AuthContext';

type ActiveWindow = {
  id: string;
  dreamEntryId?: string;
  dreamerName?: string;
  termLabel?: string;
  number?: string;
  gameType?: string;
  activeStart?: string;
  activeEnd?: string;
  isActive?: boolean;
  statesTracked?: string[];
  newHitsSinceLastCheck?: number;
  lastCheckedAt?: string | null;
  [key: string]: unknown;
};

type DreamWindowGroup = {
  dreamEntryId: string;
  dreamerName: string;
  activeStart: string;
  activeEnd: string;
  isActive: boolean;
  statesTracked: string[];
  cash3Numbers: string[];
  cash4Numbers: string[];
  termMap: Record<string, { cash3: string[]; cash4: string[] }>;
  totalWatchItems: number;
  newHitsSinceLastCheck: number;
  lastCheckedAt: string | null;
};

function uniqueSorted(arr: string[]) { return Array.from(new Set(arr)).sort(); }
function todayIso() { return new Date().toISOString().slice(0, 10); }

function buildGrouped(rows: ActiveWindow[]): DreamWindowGroup[] {
  const map = new Map<string, DreamWindowGroup>();
  for (const row of rows) {
    const eid = String(row.dreamEntryId || row.id || '');
    const g = map.get(eid);
    const tl = String(row.termLabel || '');
    const num = String(row.number || '');
    const gt = String(row.gameType || '');
    if (!g) {
      map.set(eid, {
        dreamEntryId: eid,
        dreamerName: String(row.dreamerName || 'Unknown'),
        activeStart: String(row.activeStart || ''),
        activeEnd: String(row.activeEnd || ''),
        isActive: !!row.isActive,
        statesTracked: Array.isArray(row.statesTracked) ? [...row.statesTracked] : [],
        cash3Numbers: gt === 'cash3' ? [num] : [],
        cash4Numbers: gt === 'cash4' ? [num] : [],
        termMap: { [tl]: { cash3: gt === 'cash3' ? [num] : [], cash4: gt === 'cash4' ? [num] : [] } },
        totalWatchItems: 1,
        newHitsSinceLastCheck: Number(row.newHitsSinceLastCheck ?? 0),
        lastCheckedAt: row.lastCheckedAt ?? null,
      });
      continue;
    }
    g.isActive = g.isActive || !!row.isActive;
    g.newHitsSinceLastCheck += Number(row.newHitsSinceLastCheck ?? 0);
    if (row.lastCheckedAt && (!g.lastCheckedAt || String(row.lastCheckedAt) > g.lastCheckedAt)) {
      g.lastCheckedAt = String(row.lastCheckedAt);
    }
    g.statesTracked = uniqueSorted([...g.statesTracked, ...(Array.isArray(row.statesTracked) ? row.statesTracked : [])]);
    if (gt === 'cash3') g.cash3Numbers.push(num); else g.cash4Numbers.push(num);
    if (!g.termMap[tl]) g.termMap[tl] = { cash3: [], cash4: [] };
    if (gt === 'cash3') g.termMap[tl].cash3.push(num); else g.termMap[tl].cash4.push(num);
    g.totalWatchItems++;
  }
  return Array.from(map.values())
    .map(g => ({ ...g, cash3Numbers: uniqueSorted(g.cash3Numbers), cash4Numbers: uniqueSorted(g.cash4Numbers), statesTracked: uniqueSorted(g.statesTracked) }))
    .sort((a, b) => a.activeStart < b.activeStart ? 1 : -1);
}

// ── Error banner ─────────────────────────────────────────────────────────────
function ErrorBanner({ msg }: { msg: string }) {
  const isIndex = msg.includes('index') || msg.includes('FAILED_PRECONDITION');
  const isQuota = msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
  const [open, setOpen] = React.useState(false);
  const border = isIndex || isQuota ? 'rgba(255,204,80,0.28)' : 'rgba(255,85,85,0.28)';
  const bg     = isIndex || isQuota ? 'rgba(255,204,80,0.08)' : 'rgba(255,85,85,0.10)';
  const color  = isIndex || isQuota ? '#ffcc50'                : '#ff9090';
  return (
    <div style={{ padding:'14px 16px', borderRadius:'14px', border:`1px solid ${border}`, background:bg, color, fontSize:'13px', lineHeight:1.7 }}>
      {isIndex && <strong>⚠ Firestore index required</strong>}
      {isQuota && <strong>⚠ Firebase quota exhausted</strong>}
      {!isIndex && !isQuota && <strong>⚠ Could not load data</strong>}
      <br />
      {isIndex && 'Create the suggested Firebase index, wait until active, then refresh. '}
      {isQuota && 'Read quota is temporarily exhausted. Try again after reset or reduce testing. '}
      {!isIndex && !isQuota && msg}
      {(isIndex || isQuota) && (
        <span>
          <button type="button" onClick={() => setOpen(o => !o)}
            style={{ marginLeft:'8px', fontSize:'11px', opacity:0.7, background:'none', border:'none', cursor:'pointer', color:'inherit', textDecoration:'underline' }}>
            {open ? 'hide details' : 'details'}
          </button>
          {open && <div style={{ marginTop:'6px', fontSize:'11px', opacity:0.75, wordBreak:'break-all', fontFamily:'monospace' }}>{msg}</div>}
        </span>
      )}
    </div>
  );
}


// ── Cap-awareness helper ──────────────────────────────────────────────────
function CapWarning({ capped, count, hasMore, dreamerBreakdown, onFilter }: {
  capped?: boolean; count: number; hasMore?: boolean;
  dreamerBreakdown?: Record<string, number>;
  onFilter?: (dreamerId: string, dreamerName: string) => void;
}) {
  if (!capped && !hasMore) return null;
  return (
    <div style={{ padding:'10px 14px', borderRadius:'13px', border:'1px solid rgba(255,204,80,0.28)',
      background:'rgba(255,204,80,0.07)', fontSize:'12px', color:'rgba(255,255,255,0.70)', lineHeight:1.7 }}>
      <strong style={{ color:'#ffcc50' }}>⚠ Showing first {count} windows — more exist.</strong>
      {' '}Filter by dreamer or dream entry to see complete groups.
      {dreamerBreakdown && Object.entries(dreamerBreakdown).length > 0 && onFilter && (
        <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', marginTop:'7px' }}>
          <span style={{ color:'rgba(255,255,255,0.45)', fontSize:'11px' }}>Show only:</span>
          {Object.entries(dreamerBreakdown).map(([name, cnt]) => (
            <button key={name} type="button"
              onClick={() => onFilter('', name)}
              style={{ padding:'2px 9px', borderRadius:'999px', fontSize:'10px', fontWeight:700, cursor:'pointer',
                background:'rgba(160,144,255,0.14)', border:'1px solid rgba(160,144,255,0.28)', color:'#a090ff' }}>
              {name} ({cnt})
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ActiveWindowsPage() {
  const { user } = useAuth();
  const [rows,         setRows]         = useState<ActiveWindow[]>([]);
  const [groups,       setGroups]       = useState<any[]>([]);
  const [groupSummary, setGroupSummary] = useState({ totalWindows:0, groupCount:0, dreamerBD:{} as Record<string,number>, cash3:0, cash4:0, dreamers:0 });
  const [dreamerFilter,setDreamerFilter]= useState('');
  const [capped, setCapped] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [capCount, setCapCount] = useState(0);
  const [dreamerBD, setDreamerBD] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadWindows() {
    if (!user) { setRows([]); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams({ ownerUid: user.uid, limit: '50' });
      if (dreamerFilter) qs.set('dreamerId', dreamerFilter);
      const res = await fetch(`/api/dreams/window-groups?${qs}`);
      const data = await res.json();
      if (!data.ok) { setError(data.error || 'Failed to load windows.'); return; }
      setRows(Array.isArray(data.windows) ? data.windows : []);
      setGroups(data.groups ?? []);
      setGroupSummary({
        totalWindows: data.totalActiveWindows ?? 0,
        groupCount:   data.groupCount ?? 0,
        dreamerBD:    data.dreamerBreakdown ?? {},
        cash3:        data.totalCash3Windows ?? 0,
        cash4:        data.totalCash4Windows ?? 0,
        dreamers:     data.totalUniqueDreamers ?? 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load active windows.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadWindows(); }, [user]);

  const grouped = useMemo(() => buildGrouped(rows), [rows]);
  const today = todayIso();
  const active = grouped.filter(g => g.activeEnd >= today);
  const expired = grouped.filter(g => g.activeEnd < today);

  return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px' }}>
        <section className="journal-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
            <div className="page-header">
              <h1>Dream Active Windows</h1>
              <p>Each card is one dream's 7-day active watch window. Numbers are tested against live results across all supported states.</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button type="button" className="btn-secondary" onClick={() => void loadWindows()}>↻ Refresh</button>
              <Link href="/dreams/new" className="btn-secondary">New Dream</Link>
              <Link href="/hits" className="btn-secondary">Hits Detector</Link>
            </div>
          </div>
        </section>

        <section style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          {[
            ['Dream Windows',     grouped.length],
            ['Currently Active',  active.length],
            ['Expired',           expired.length],
            ['Total Watch Items', grouped.reduce((s, g) => s + g.totalWatchItems, 0)],
          ].map(([label, val]) => (
            <div key={String(label)} style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '20px', padding: '15px 18px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.22)',
            }}>
              <strong style={{ fontSize: '2rem', letterSpacing: '-0.06em', display: 'block', color: 'var(--ink)' }}>{val}</strong>
              <span style={{ color: 'var(--muted)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
            </div>
          ))}
        </section>

        <CapWarning capped={capped} count={capCount} hasMore={hasMore}
        dreamerBreakdown={dreamerBD}
        onFilter={(_, name) => {
          console.log('Dreamer filter requires dreamerId; selected visible breakdown label:', name);
        }}
      />
      {/* Summary tiles using full window-groups data */}
      {!loading && groupSummary.totalWindows > 0 && (
        <section style={{ display:'grid', gap:'10px', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))' }}>
          {[
            { label:'Dream Groups',   val:groupSummary.groupCount,   color:'#a090ff' },
            { label:'Total Watch Items', val:groupSummary.totalWindows, color:'#ff8a6a' },
            { label:'Unique Dreamers',val:Object.keys(groupSummary.dreamerBD).length, color:'#ffcc50' },
            { label:'Cash 3 Windows', val:groupSummary.cash3,         color:'#ff8a6a' },
            { label:'Cash 4 Windows', val:groupSummary.cash4,         color:'#a090ff' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.10)', borderRadius:'14px', padding:'12px 14px' }}>
              <strong style={{ fontSize:'1.5rem', fontWeight:900, letterSpacing:'-0.04em', display:'block', lineHeight:1, color, fontFamily:'system-ui,sans-serif' }}>{val}</strong>
              <span style={{ color:'rgba(255,255,255,0.40)', fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'system-ui,sans-serif' }}>{label}</span>
            </div>
          ))}
        </section>
      )}

      {/* Dream group cards — one card per dream entry */}
      {!loading && groups.length > 0 && (
        <section style={{ display:'grid', gap:'12px' }}>
          <h2 style={{ margin:0, fontSize:'1.0rem', fontWeight:900, color:'#fff', fontFamily:'system-ui,sans-serif' }}>
            Active Dream Groups
          </h2>
          {groups.map((g: any) => (
            <div key={g.dreamEntryId || g.dreamerName} style={{ padding:'14px 16px', borderRadius:'18px',
              background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.10)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:'12px', flexWrap:'wrap', alignItems:'flex-start', marginBottom:'10px' }}>
                <div>
                  <div style={{ fontSize:'14px', fontWeight:800, color:'#fff', fontFamily:'system-ui,sans-serif' }}>{g.dreamerName}</div>
                  <div style={{ fontSize:'11px', color:'rgba(255,255,255,0.40)', fontFamily:'monospace', marginTop:'2px' }}>
                    {g.dreamDate || g.activeStart} → {g.activeEnd}
                  </div>
                </div>
                <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center' }}>
                  <span style={{ fontSize:'13px', fontWeight:700, color:'#60e09a' }}>{g.windowCount} watch items</span>
                  {g.cash3Count > 0 && <span style={{ fontSize:'11px', padding:'2px 6px', borderRadius:'6px', background:'rgba(255,107,74,0.14)', color:'#ff8a6a', border:'1px solid rgba(255,107,74,0.26)' }}>{g.cash3Count}×C3</span>}
                  {g.cash4Count > 0 && <span style={{ fontSize:'11px', padding:'2px 6px', borderRadius:'6px', background:'rgba(160,144,255,0.14)', color:'#a090ff', border:'1px solid rgba(160,144,255,0.26)' }}>{g.cash4Count}×C4</span>}
                </div>
              </div>
              {g.terms.length > 0 && (
                <div style={{ display:'flex', gap:'5px', flexWrap:'wrap', marginBottom:'7px' }}>
                  <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', marginRight:'3px', fontFamily:'system-ui,sans-serif', fontWeight:700 }}>TERMS</span>
                  {g.terms.slice(0, 8).map((t: string) => (
                    <span key={t} style={{ padding:'2px 7px', borderRadius:'6px', fontSize:'11px', fontWeight:700, background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.11)', color:'rgba(255,255,255,0.75)' }}>{t}</span>
                  ))}
                  {g.terms.length > 8 && <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.35)' }}>+{g.terms.length - 8} more</span>}
                </div>
              )}
              {g.numbers.length > 0 && (
                <div style={{ display:'flex', gap:'5px', flexWrap:'wrap' }}>
                  <span style={{ fontSize:'10px', color:'rgba(255,255,255,0.35)', marginRight:'3px', fontFamily:'system-ui,sans-serif', fontWeight:700 }}>NUMBERS</span>
                  {g.numbers.slice(0, 10).map((n: string) => (
                    <span key={n} style={{ fontFamily:'monospace', fontWeight:700, fontSize:'11px', padding:'2px 6px', borderRadius:'6px', background:'rgba(255,107,74,0.14)', border:'1px solid rgba(255,107,74,0.26)', color:'#ff8a6a' }}>{n}</span>
                  ))}
                  {g.numbers.length > 10 && <span style={{ fontSize:'11px', color:'rgba(255,255,255,0.35)' }}>+{g.numbers.length - 10} more</span>}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {loading && <section className="journal-card"><p>Loading dream windows…</p></section>}
        {error && <ErrorBanner msg={error} />}
        {!loading && !grouped.length && <section className="journal-card"><p>No dream windows yet. <Link href="/dreams/new">Create your first dream entry →</Link></p></section>}

        {active.length > 0 && (
          <section style={{ display: 'grid', gap: '16px' }}>
            <div className="page-header"><h1>Currently Active</h1><p>These dreams are inside their 7-day watch period.</p></div>
            {active.map(group => (
              <section key={group.dreamEntryId} className="journal-card" style={{ display: 'grid', gap: '18px' }}>

                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ display: 'grid', gap: '6px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, letterSpacing: '-0.03em', fontFamily: 'system-ui,sans-serif', color: 'var(--aurora-text)' }}>
                      {group.dreamerName}
                    </h2>
                    {group.newHitsSinceLastCheck > 0 && (
                      <span style={{ display: 'inline-flex', padding: '4px 12px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: 'rgba(255,204,80,0.18)', border: '1px solid rgba(255,204,80,0.38)', color: '#ffcc50', width: 'fit-content' }}>
                        ✦ {group.newHitsSinceLastCheck} new hit{group.newHitsSinceLastCheck !== 1 ? 's' : ''} since last refresh
                      </span>
                    )}
                    <div style={{ fontSize: '13px', color: 'var(--aurora-text2)', fontFamily: 'monospace' }}>
                      {group.activeStart} → {group.activeEnd}
                    </div>
                    {group.lastCheckedAt && (
                      <div style={{ fontSize: '11px', color: 'var(--aurora-text3)' }}>
                        Checked {String(group.lastCheckedAt).slice(0, 16).replace('T', ' ')} UTC
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[
                      { label: 'C3', val: group.cash3Numbers.length, color: 'var(--aurora-coral)' },
                      { label: 'C4', val: group.cash4Numbers.length, color: 'var(--aurora-purple)' },
                      { label: 'Items', val: group.totalWatchItems, color: 'var(--aurora-green)' },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '8px 14px', minWidth: '54px' }}>
                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: s.color, lineHeight: 1, letterSpacing: '-0.04em', fontFamily: 'system-ui,sans-serif' }}>{s.val}</div>
                        <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--aurora-text3)', textTransform: 'uppercase', letterSpacing: '0.09em', marginTop: '3px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Number chips */}
                <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--aurora-coral)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '8px' }}>
                      Cash 3 — {group.cash3Numbers.length} numbers
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {group.cash3Numbers.length > 0
                        ? group.cash3Numbers.map((n: string) => (
                            <span key={n} style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '14px', background: 'rgba(255,107,74,0.14)', border: '1px solid rgba(255,107,74,0.28)', borderRadius: '8px', padding: '4px 10px', color: 'var(--aurora-coral2)', letterSpacing: '0.06em' }}>{n}</span>
                          ))
                        : <span style={{ color: 'var(--aurora-text3)', fontSize: '13px', fontStyle: 'italic' }}>None</span>
                      }
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--aurora-purple)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '8px' }}>
                      Cash 4 — {group.cash4Numbers.length} numbers
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {group.cash4Numbers.length > 0
                        ? group.cash4Numbers.map((n: string) => (
                            <span key={n} style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '14px', background: 'rgba(160,144,255,0.14)', border: '1px solid rgba(160,144,255,0.28)', borderRadius: '8px', padding: '4px 10px', color: 'var(--aurora-purple)', letterSpacing: '0.06em' }}>{n}</span>
                          ))
                        : <span style={{ color: 'var(--aurora-text3)', fontSize: '13px', fontStyle: 'italic' }}>None</span>
                      }
                    </div>
                  </div>
                </div>

                {/* Mapped terms */}
                <div>
                  <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--aurora-gold)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '10px' }}>
                    Mapped Terms — {Object.keys(group.termMap).length} terms
                  </div>
                  <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                    {Object.entries(group.termMap).map(([term, payload]: [string, any]) => (
                      <div key={term} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px', padding: '12px 14px' }}>
                        <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--aurora-text)', letterSpacing: '-0.02em', marginBottom: '8px', fontFamily: 'system-ui,sans-serif' }}>
                          {term}
                        </div>
                        {payload.cash3?.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--aurora-coral)', textTransform: 'uppercase', letterSpacing: '0.10em', alignSelf: 'center', marginRight: '2px' }}>C3</span>
                            {payload.cash3.map((n: string) => (
                              <span key={n} style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '13px', background: 'rgba(255,107,74,0.12)', border: '1px solid rgba(255,107,74,0.24)', borderRadius: '6px', padding: '2px 7px', color: 'var(--aurora-coral2)' }}>{n}</span>
                            ))}
                          </div>
                        )}
                        {payload.cash4?.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--aurora-purple)', textTransform: 'uppercase', letterSpacing: '0.10em', alignSelf: 'center', marginRight: '2px' }}>C4</span>
                            {payload.cash4.map((n: string) => (
                              <span key={n} style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '13px', background: 'rgba(160,144,255,0.12)', border: '1px solid rgba(160,144,255,0.24)', borderRadius: '6px', padding: '2px 7px', color: 'var(--aurora-purple)' }}>{n}</span>
                            ))}
                          </div>
                        )}
                        {(!payload.cash3?.length && !payload.cash4?.length) && (
                          <span style={{ color: 'var(--aurora-text3)', fontSize: '12px', fontStyle: 'italic' }}>No mapped numbers</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

              </section>
            ))}
          </section>
        )}

        {expired.length > 0 && (
          <section style={{ display: 'grid', gap: '12px' }}>
            <div className="page-header"><h1>Expired Windows</h1><p>Outside the 7-day watch period.</p></div>
            {expired.map(group => (
              <section key={group.dreamEntryId} className="journal-card-flat" style={{ opacity: 0.75 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                  <div><strong>{group.dreamerName}</strong><div style={{ fontSize: '13px', color: 'var(--aurora-text2)' }}>{group.activeStart} → {group.activeEnd}</div></div>
                  <div style={{ fontSize: '13px', color: 'var(--aurora-text2)' }}>Cash 3: {group.cash3Numbers.length} · Cash 4: {group.cash4Numbers.length}</div>
                </div>
              </section>
            ))}
          </section>
        )}
    </div>
  );
}
