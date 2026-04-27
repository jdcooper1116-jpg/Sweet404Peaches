'use client';
import Link from 'next/link';
import Sidebar from '@/components/layout/Sidebar';

export default function OwnerNamePage() {
  return (
    <main style={{
      minHeight: '100vh', display: 'grid', gridTemplateColumns: '280px 1fr',
      background: 'radial-gradient(circle at top left,rgba(228,192,123,0.14),transparent 18%),radial-gradient(circle at top right,rgba(108,120,255,0.12),transparent 22%),linear-gradient(135deg,#1A1A2E 0%,#16213E 48%,#0F3460 100%)',
    }}>
      <Sidebar />
      <section style={{ padding: '32px', display: 'grid', gap: '24px', alignContent: 'start' }}>
        <section className="journal-card">
          <div style={{ display:'inline-flex',alignItems:'center',gap:'8px',padding:'3px 10px',borderRadius:'8px',background:'rgba(156,163,175,0.12)',border:'1px solid rgba(156,163,175,0.2)',color:'#9ca3af',fontSize:'11px',fontWeight:700,marginBottom:'12px' }}>
            LEGACY
          </div>
          <div className="page-header">
            <h1>Owner Name Cleanup</h1>
            <p>This migration tool has been superseded. Owner profile management is now handled through the Dreamers page and server-side Admin routes.</p>
          </div>
        </section>
        <section className="journal-card">
          <p style={{ color:'var(--ink-light)',margin:0,lineHeight:1.7 }}>
            The owner display name migration utility that was here relied on client-side Firestore. It has been deprecated.<br /><br />
            To manage your owner profile or dreamer records, use:
          </p>
          <div style={{ display:'flex',gap:'10px',flexWrap:'wrap',marginTop:'16px' }}>
            <Link href="/dreamers" className="btn-primary">Manage Dreamers</Link>
            <Link href="/cleanup"  className="btn-secondary">Cleanup Tools</Link>
          </div>
        </section>
      </section>
    </main>
  );
}
