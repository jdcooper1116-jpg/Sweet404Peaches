'use client';
import Link from 'next/link';

export default function OwnerNamePage() {
  return (
    <div className="page-shell" style={{ padding: 'clamp(18px, 3vw, 32px)', display: 'grid', gap: '24px' }}>
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
    </div>
  );
}
