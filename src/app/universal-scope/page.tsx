'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';

export default function UniversalScopePage() {
  const { user, loading: authLoading } = useAuth();

  const [dreamers,  setDreamers]  = useState<any[]>([]);
  const [windows,   setWindows]   = useState<any[]>([]);
  const [memory,    setMemory]    = useState<any[]>([]);
  const [dictTerms, setDictTerms] = useState<any[]>([]);
  const [hits,      setHits]      = useState<any[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      if (!user) { setPageLoading(false); return; }
      try {
        const uid = encodeURIComponent(user.uid);
        const [dr, wr, mr, tr, hr] = await Promise.all([
          fetch(`/api/dreamers?ownerUid=${uid}`),
          fetch(`/api/dreams/windows?ownerUid=${uid}`),
          fetch(`/api/fell-before?ownerUid=${uid}`),
          fetch(`/api/dictionary/terms?ownerUid=${uid}`),
          fetch(`/api/dreams/hits?ownerUid=${uid}`),
        ]);
        const [dd, wd, md, td, hd] = await Promise.all([dr.json(), wr.json(), mr.json(), tr.json(), hr.json()]);
        if (dd.ok) setDreamers(dd.dreamers ?? []);
        if (wd.ok) setWindows(wd.windows   ?? []);
        if (md.ok) setMemory(md.rows        ?? []);
        if (td.ok) setDictTerms(td.terms    ?? []);
        if (hd.ok) setHits(hd.hits          ?? []);
      } catch (err) {
        console.error(err);
        setError('Could not load Universal Scope data.');
      } finally { setPageLoading(false); }
    }
    if (!authLoading) void load();
  }, [user, authLoading]);

  const today = new Date().toISOString().slice(0, 10);
  const liveWins = useMemo(() =>
    windows.filter(w => (w.activeEnd ?? w.activeWindowEnd ?? '') >= today),
    [windows, today]
  );

  // Top terms by hit count from memory
  const topTerms = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of memory) {
      if (m.termLabel) map.set(m.termLabel, (map.get(m.termLabel) ?? 0) + Number(m.hitCount ?? 0));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [memory]);

  // Strongest dreamers by total hits
  const dreamerHits = useMemo(() => {
    const map = new Map<string, { name: string; hits: number }>();
    for (const m of memory) {
      const did  = m.dreamerId  || 'owner-self';
      const name = m.dreamerName || did;
      const ex = map.get(did);
      if (!ex) map.set(did, { name, hits: Number(m.hitCount ?? 0) });
      else ex.hits += Number(m.hitCount ?? 0);
    }
    return Array.from(map.values()).sort((a, b) => b.hits - a.hits).slice(0, 8);
  }, [memory]);

  return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px' }}>

        <section className="journal-card">
          <div style={{ display:'flex',justifyContent:'space-between',gap:'16px',flexWrap:'wrap',alignItems:'flex-start' }}>
            <div className="page-header">
              <h1>Universal Scope</h1>
              <p>Global system overview across all dreamers, dictionaries, and memories. Use the links below to navigate into each intelligence layer.</p>
            </div>
            <div style={{ display:'flex',gap:'10px',flexWrap:'wrap' }}>
              <Link href="/dictionary"    className="btn-secondary">Universal Dictionary</Link>
              <Link href="/fell-before"   className="btn-secondary">As They Fell Before</Link>
              <Link href="/dreamers"      className="btn-secondary">Dreamers</Link>
              <Link href="/intelligence"  className="btn-secondary">Intelligence Hub</Link>
            </div>
          </div>
        </section>

        {/* Architecture explanation */}
        <section className="journal-card-flat" style={{ display:'grid',gap:'10px',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))' }}>
          <div style={{ padding:'14px',borderRadius:'14px',background:'rgba(108,120,255,0.08)',border:'1px solid rgba(108,120,255,0.18)' }}>
            <strong style={{ fontSize:'13px',color:'#b0b8ff' }}>Universal Dictionary</strong>
            <p style={{ margin:'6px 0 0',fontSize:'12.5px',color:'var(--ink-light)',lineHeight:1.5 }}>
              All mapped term-number relationships from every dream, every dreamer. Includes non-hit mappings. Global and shared.
            </p>
            <Link href="/dictionary" style={{ color:'#b0b8ff',fontSize:'12px' }}>Open Dictionary →</Link>
          </div>
          <div style={{ padding:'14px',borderRadius:'14px',background:'rgba(74,124,89,0.08)',border:'1px solid rgba(74,124,89,0.18)' }}>
            <strong style={{ fontSize:'13px',color:'#6dbf8a' }}>As They Fell Before</strong>
            <p style={{ margin:'6px 0 0',fontSize:'12.5px',color:'var(--ink-light)',lineHeight:1.5 }}>
              Confirmed hit memory only. Scoped to each dreamer. Owner / Self and each dreamer each have their own personal dictionary.
            </p>
            <Link href="/fell-before" style={{ color:'#6dbf8a',fontSize:'12px' }}>Open Hit Memory →</Link>
          </div>
        </section>

        {/* Stats */}
        <section className="journal-card-flat" style={{ display:'grid',gap:'12px',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))' }}>
          {[
            ['Dreamers',           dreamers.length + 1],
            ['Dictionary Mappings', dictTerms.length],
            ['Memory Rows',        memory.length],
            ['Active Windows',     liveWins.length],
            ['Current Hits',       hits.length],
          ].map(([label, val]) => (
            <div key={String(label)}>
              <div className="journal-label">{label}</div>
              <div style={{ fontSize:'1.8rem',fontWeight:700 }}>{val}</div>
            </div>
          ))}
        </section>

        {pageLoading && <section className="journal-card"><p>Loading Universal Scope…</p></section>}
        {error       && <section className="journal-card-flat" style={{ borderColor:'#e9c2c2',background:'#fff4f4',color:'#8a2f2f' }}>{error}</section>}

        {!pageLoading && !error && (
          <section style={{ display:'grid',gap:'24px',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))' }}>
            {/* Top terms */}
            <section className="journal-card">
              <div className="page-header"><h1>Strongest Terms (All Dreamers)</h1><p>By total confirmed hits in personalHitMappings.</p></div>
              {topTerms.length > 0 ? (
                <div style={{ display:'grid',gap:'6px',marginTop:'10px' }}>
                  {topTerms.map(([term, hits], i) => (
                    <div key={term} className="journal-card-flat" style={{ display:'flex',justifyContent:'space-between',fontSize:'13px' }}>
                      <span><strong>#{i+1} {term}</strong></span>
                      <span style={{ color:'#6dbf8a',fontWeight:700 }}>{hits} hit{hits !== 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              ) : <p style={{ color:'var(--ink-light)',margin:'10px 0 0',fontSize:'13px' }}>No hit memory yet. Run a dream refresh or engine backtest.</p>}
            </section>

            {/* Dreamer activity */}
            <section className="journal-card">
              <div className="page-header"><h1>Dreamer Activity</h1><p>Total confirmed hits by dreamer across all memory.</p></div>
              {dreamerHits.length > 0 ? (
                <div style={{ display:'grid',gap:'6px',marginTop:'10px' }}>
                  {dreamerHits.map((d, i) => (
                    <div key={d.name} className="journal-card-flat" style={{ display:'flex',justifyContent:'space-between',fontSize:'13px' }}>
                      <span><strong>#{i+1} {d.name}</strong></span>
                      <span style={{ color:'#b0b8ff',fontWeight:700 }}>{d.hits} hit{d.hits !== 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              ) : <p style={{ color:'var(--ink-light)',margin:'10px 0 0',fontSize:'13px' }}>No dreamer hit data yet.</p>}
            </section>
          </section>
        )}

        {/* Quick links */}
        <section className="journal-card-flat" style={{ display:'grid',gap:'10px',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))' }}>
          {[
            { href:'/intelligence',  label:'Intelligence Hub'   },
            { href:'/hot-numbers',   label:'Hot Families'       },
            { href:'/forecast-board',label:'Forecast Board'     },
            { href:'/playlists',     label:'State Playlists'    },
            { href:'/performance',   label:'Performance'        },
          ].map(({ href, label }) => (
            <Link key={href} href={href} className="journal-card-flat"
              style={{ textDecoration:'none',color:'inherit',fontSize:'13px',fontWeight:600 }}>
              {label}
            </Link>
          ))}
        </section>

    </div>
  );
}
