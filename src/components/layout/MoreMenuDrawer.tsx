'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import {
  Activity,
  Archive,
  BarChart3,
  BookMarked,
  BookOpen,
  Brain,
  CalendarRange,
  Database,
  Flame,
  LayoutDashboard,
  MapPinned,
  MessageCircleHeart,
  MoonStar,
  ReceiptText,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Trophy,
  Trash2,
  Users,
  Wrench,
  X,
  Zap,
} from 'lucide-react';

type NavEntry = {
  href:  string;
  label: string;
  icon:  React.ComponentType<{ size?: number; strokeWidth?: number }>;
  badge?: string;
};

type NavGroup = {
  title: string;
  items: NavEntry[];
};

const GROUPS: NavGroup[] = [
  {
    title: 'Dream Ledger',
    items: [
      { href: '/dashboard',   label: 'Ledger Dashboard',     icon: LayoutDashboard },
      { href: '/dreams/new',  label: 'Write a Dream',        icon: MoonStar },
      { href: '/dreams',      label: 'Dream Journal',        icon: BookOpen },
      { href: '/windows',     label: 'Active Windows',       icon: CalendarRange },
      { href: '/hits',        label: 'Hits Detector',        icon: SearchCheck },
      { href: '/fell-before', label: 'As They Fell Before',  icon: BookMarked },
      { href: '/dreamers',    label: 'Dreamers',             icon: Users },
      { href: '/dictionary',  label: 'Universal Dictionary', icon: Database },
    ],
  },
  {
    title: 'Results & Ops',
    items: [
      { href: '/results',         label: 'Results Log',      icon: ReceiptText },
      { href: '/results/import',  label: 'Engine Sync',      icon: Zap },
      { href: '/results/rescan',  label: 'Dream Re-Refresh', icon: Wrench },
      { href: '/daily-ops',       label: 'Daily Ops',        icon: Activity },
      { href: '/integrity',       label: 'Integrity',        icon: ShieldCheck },
      { href: '/cleanup',         label: 'Cleanup',          icon: Trash2 },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { href: '/intelligence',   label: 'Intelligence Hub',  icon: Brain },
      { href: '/chat',           label: 'Intelligence Chat', icon: MessageCircleHeart },
      { href: '/forecast-board', label: 'Forecast Board',   icon: MapPinned },
      { href: '/hot-numbers',    label: 'Hot Families',      icon: Flame },
      { href: '/performance',    label: 'Performance',       icon: BarChart3 },
      { href: '/playlists',      label: 'State Playlists',   icon: Sparkles },
      { href: '/pinned-plays',   label: 'Pinned Plays',      icon: MapPinned },
    ],
  },
  {
    title: 'Backtesting',
    items: [
      { href: '/backtesting',          label: 'Backtesting Portal',   icon: Zap },
      { href: '/backtesting/intake',   label: 'Historical Intake',    icon: MoonStar },
      { href: '/backtesting/replay',   label: 'Replay Lab',           icon: Activity },
      { href: '/backtesting/archive',  label: 'Archive',              icon: Archive },
      { href: '/backtesting/evidence', label: 'Evidence Tracker',     icon: Trophy },
    ],
  },
];

type Props = {
  isOpen:  boolean;
  onClose: () => void;
};

export default function MoreMenuDrawer({ isOpen, onClose }: Props) {
  // Lock body scroll while drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position:   'fixed',
          inset:       0,
          zIndex:      90,
          background: 'rgba(42, 32, 36, 0.40)',
          backdropFilter: 'blur(2px)',
          transition: 'opacity 0.22s ease',
          opacity:    isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        style={{
          position:     'fixed',
          bottom:       0,
          left:         0,
          right:        0,
          zIndex:       100,
          background:   'var(--cream)',
          borderRadius: '24px 24px 0 0',
          borderTop:    '1px solid var(--border-muted)',
          boxShadow:    '0 -8px 48px rgba(42, 32, 36, 0.16)',
          maxHeight:    '82vh',
          overflowY:    'auto',
          paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
          transform:    isOpen ? 'translateY(0)' : 'translateY(100%)',
          transition:   'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Handle + header */}
        <div
          style={{
            position:   'sticky',
            top:        0,
            zIndex:     2,
            background: 'var(--cream)',
            padding:    '12px 20px 14px',
            borderBottom: '1px solid var(--border-muted)',
          }}
        >
          {/* Drag handle */}
          <div
            aria-hidden="true"
            style={{
              width:        '36px',
              height:       '4px',
              borderRadius: '2px',
              background:   'var(--border-muted)',
              margin:       '0 auto 12px',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{
              fontSize:   '15px',
              fontWeight: 700,
              color:      'var(--plum)',
              fontStyle:  'italic',
              fontFamily: 'var(--font-display), Georgia, serif',
            }}>
              Sweet404Peaches
            </span>
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={onClose}
              style={{
                width:        '34px',
                height:       '34px',
                borderRadius: '50%',
                border:       '1px solid var(--border-muted)',
                background:   'rgba(255,255,255,0.70)',
                display:      'grid',
                placeItems:   'center',
                cursor:       'pointer',
                color:        'var(--taupe)',
              }}
            >
              <X size={15} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Nav groups */}
        <div style={{ padding: '12px 16px 8px' }}>
          {GROUPS.map((group, gi) => (
            <section key={group.title} style={{ marginBottom: gi < GROUPS.length - 1 ? '20px' : '8px' }}>
              <div style={{
                fontSize:      '10px',
                fontWeight:    700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color:         'var(--clay)',
                padding:       '0 8px',
                marginBottom:  '8px',
              }}>
                {group.title}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {group.items.map(item => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      style={{
                        display:        'flex',
                        alignItems:     'center',
                        gap:            '10px',
                        padding:        '11px 12px',
                        borderRadius:   '14px',
                        textDecoration: 'none',
                        color:          'var(--ink)',
                        background:     'rgba(255,255,255,0.72)',
                        border:         '1px solid var(--border-muted)',
                        minHeight:      '44px',
                        transition:     'background 0.16s ease, border-color 0.16s ease',
                      }}
                    >
                      <span style={{
                        width:        '28px',
                        height:       '28px',
                        borderRadius: '8px',
                        background:   'rgba(242, 138, 106, 0.10)',
                        display:      'grid',
                        placeItems:   'center',
                        flexShrink:   0,
                        color:        'var(--clay)',
                      }}>
                        <Icon size={14} strokeWidth={1.8} />
                      </span>
                      <span style={{
                        fontSize:   '13px',
                        fontWeight: 600,
                        lineHeight: 1.2,
                        color:      'var(--ink)',
                        flex:       1,
                        minWidth:   0,
                      }}>
                        {item.label}
                      </span>
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
