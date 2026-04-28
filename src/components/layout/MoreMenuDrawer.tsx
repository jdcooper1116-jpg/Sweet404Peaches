'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { Activity, Archive, BarChart3, BookMarked, BookOpen, Brain, CalendarRange, Database, Flame, LayoutDashboard, MapPinned, MessageCircleHeart, MoonStar, ReceiptText, SearchCheck, ShieldCheck, Sparkles, Trophy, Trash2, Users, Wrench, X, Zap } from 'lucide-react';

const GROUPS = [
  { title: 'Dream Ledger', items: [
    { href: '/dashboard',   label: 'Ledger Dashboard',     icon: LayoutDashboard },
    { href: '/dreams/new',  label: 'Write a Dream',        icon: MoonStar },
    { href: '/dreams',      label: 'Dream Journal',        icon: BookOpen },
    { href: '/windows',     label: 'Active Windows',       icon: CalendarRange },
    { href: '/hits',        label: 'Hits Detector',        icon: SearchCheck },
    { href: '/fell-before', label: 'As They Fell Before',  icon: BookMarked },
    { href: '/dreamers',    label: 'Dreamers',             icon: Users },
    { href: '/dictionary',  label: 'Universal Dictionary', icon: Database },
  ]},
  { title: 'Results & Ops', items: [
    { href: '/results',        label: 'Results Log',      icon: ReceiptText },
    { href: '/results/import', label: 'Engine Sync',      icon: Zap },
    { href: '/results/rescan', label: 'Dream Re-Refresh', icon: Wrench },
    { href: '/daily-ops',      label: 'Daily Ops',        icon: Activity },
    { href: '/integrity',      label: 'Integrity',        icon: ShieldCheck },
    { href: '/cleanup',        label: 'Cleanup',          icon: Trash2 },
  ]},
  { title: 'Intelligence', items: [
    { href: '/intelligence',   label: 'Intelligence Hub',  icon: Brain },
    { href: '/chat',           label: 'Intelligence Chat', icon: MessageCircleHeart },
    { href: '/forecast-board', label: 'Forecast Board',   icon: MapPinned },
    { href: '/hot-numbers',    label: 'Hot Families',      icon: Flame },
    { href: '/performance',    label: 'Performance',       icon: BarChart3 },
    { href: '/playlists',      label: 'State Playlists',   icon: Sparkles },
  ]},
  { title: 'Backtesting', items: [
    { href: '/backtesting',          label: 'Backtesting Portal',   icon: Zap },
    { href: '/backtesting/intake',   label: 'Historical Intake',    icon: MoonStar },
    { href: '/backtesting/replay',   label: 'Replay Lab',           icon: Activity },
    { href: '/backtesting/archive',  label: 'Archive',              icon: Archive },
    { href: '/backtesting/evidence', label: 'Evidence Tracker',     icon: Trophy },
  ]},
];

export default function MoreMenuDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  return (
    <>
      <div aria-hidden="true" onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(0,0,0,0.60)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        transition: 'opacity 0.22s ease',
        opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? 'auto' : 'none',
      }} />
      <div role="dialog" aria-modal="true" aria-label="Navigation menu" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(22,8,40,0.97)',
        backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
        borderRadius: '24px 24px 0 0',
        borderTop: '1px solid rgba(255,107,74,0.20)',
        boxShadow: '0 -8px 48px rgba(0,0,0,0.50)',
        maxHeight: '82vh', overflowY: 'auto',
        paddingBottom: 'calc(72px + env(safe-area-inset-bottom,0px))',
        transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)',
        WebkitOverflowScrolling: 'touch',
      }}>
        <div style={{
          position: 'sticky', top: 0, zIndex: 2,
          background: 'rgba(22,8,40,0.96)',
          padding: '12px 18px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(16px)',
        }}>
          <div aria-hidden="true" style={{ width: '36px', height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.15)', margin: '0 auto 12px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{
              fontSize: '15px', fontWeight: 900, letterSpacing: '-0.03em',
              fontFamily: 'system-ui,-apple-system,sans-serif',
              background: 'linear-gradient(135deg,#ff8a6a,#a090ff)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>Sweet404Peaches</span>
            <button type="button" aria-label="Close navigation menu" onClick={onClose} style={{
              width: '32px', height: '32px', borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.07)',
              display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.55)',
            }}><X size={14} strokeWidth={2} /></button>
          </div>
        </div>
        <div style={{ padding: '12px 14px 8px' }}>
          {GROUPS.map((group, gi) => (
            <section key={group.title} style={{ marginBottom: gi < GROUPS.length - 1 ? '20px' : '8px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(160,144,255,0.60)', padding: '0 8px', marginBottom: '8px', fontFamily: 'system-ui,sans-serif' }}>
                {group.title}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {group.items.map(item => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} onClick={onClose} style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 12px',
                      borderRadius: '14px', textDecoration: 'none', color: 'rgba(255,255,255,0.80)',
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)',
                      minHeight: '44px', transition: 'background 0.14s ease',
                    }}>
                      <span style={{ width: '26px', height: '26px', borderRadius: '8px', background: 'rgba(255,107,74,0.12)', display: 'grid', placeItems: 'center', flexShrink: 0, color: '#ff8a6a' }}>
                        <Icon size={13} strokeWidth={1.8} />
                      </span>
                      <span style={{ fontSize: '12.5px', fontWeight: 600, lineHeight: 1.2, fontFamily: 'system-ui,sans-serif' }}>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
