'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  PenLine,
  ReceiptText,
  SearchCheck,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  Trash2,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type BadgeKind = 'Legacy' | 'Needs Audit' | 'Repurpose' | 'Experimental';

type NavItem = {
  href:   string;
  label:  string;
  icon:   any;
  badge?: BadgeKind;
};

// ─── Nav sections ─────────────────────────────────────────────────────────────

const dreamLedgerNav: NavItem[] = [
  { href: '/dashboard',   label: 'Ledger Dashboard',     icon: LayoutDashboard },
  { href: '/dreams/new',  label: 'Write a Dream',        icon: PenLine },
  { href: '/dreams',      label: 'Dream Journal',        icon: BookOpen },
  { href: '/dreamers',    label: 'Dreamers',             icon: Users },
  { href: '/windows',     label: 'Active Windows',       icon: CalendarRange },
  { href: '/hits',        label: 'Hits Detector',        icon: SearchCheck },
  { href: '/fell-before', label: 'As They Fell Before',  icon: BookMarked },
  { href: '/dictionary',  label: 'Universal Dictionary', icon: Database },
];

const resultsOpsNav: NavItem[] = [
  { href: '/results',        label: 'Results Log',        icon: ReceiptText },
  { href: '/results/import', label: 'Engine Coverage',    icon: Zap },
  { href: '/results/rescan', label: 'Dream Re-Refresh',   icon: Wrench },
  { href: '/daily-ops',      label: 'Daily Ops',          icon: Activity },
  { href: '/integrity',      label: 'Integrity Console',  icon: ShieldCheck },
  { href: '/cleanup',        label: 'Cleanup Tools',      icon: Trash2 },
];

const intelligenceNav: NavItem[] = [
  { href: '/intelligence',    label: 'Intelligence Hub',   icon: Brain },
  { href: '/chat',            label: 'Intelligence Chat',  icon: MessageCircleHeart },
  { href: '/forecast-board',  label: 'Forecast Board',     icon: MapPinned },
  { href: '/hot-numbers',     label: 'Hot Families',       icon: Flame },
  { href: '/playlists',       label: 'State Playlists',    icon: Sparkles },
  { href: '/performance',     label: 'Performance',        icon: BarChart3 },
  { href: '/pinned-plays',    label: 'Pinned Plays',       icon: MapPinned },
  { href: '/universal-scope', label: 'Universal Scope',    icon: Sparkles },
];

const backtestingNav: NavItem[] = [
  { href: '/backtesting',          label: 'Backtesting Portal',      icon: Zap },
  { href: '/backtesting/intake',   label: 'Historical Dream Intake', icon: MoonStar },
  { href: '/backtesting/replay',   label: 'Replay Lab',              icon: Activity },
  { href: '/backtesting/archive',  label: 'Backtest Archive',        icon: Archive },
  { href: '/backtesting/evidence', label: 'Evidence Tracker',        icon: Trophy },
  { href: '/backtesting/results',  label: 'Legacy Results Upload',   icon: ReceiptText, badge: 'Legacy' },
  { href: '/cleanup/owner-name',   label: 'Owner Rename',            icon: Settings,    badge: 'Legacy' },
];

// ─── Badge palette ────────────────────────────────────────────────────────────
// Warm-only: no loud yellow-on-dark or cold blues

const BADGE_STYLES: Record<BadgeKind, { bg: string; color: string; border: string }> = {
  'Needs Audit': {
    bg:     'rgba(216, 164, 91, 0.14)',
    color:  'var(--clay)',
    border: 'rgba(216, 164, 91, 0.30)',
  },
  'Legacy': {
    bg:     'rgba(107, 90, 96, 0.12)',
    color:  'var(--taupe)',
    border: 'rgba(107, 90, 96, 0.22)',
  },
  'Repurpose': {
    bg:     'rgba(61, 122, 82, 0.12)',
    color:  'var(--green)',
    border: 'rgba(61, 122, 82, 0.24)',
  },
  'Experimental': {
    bg:     'rgba(123, 90, 111, 0.12)',
    color:  'var(--plum)',
    border: 'rgba(123, 90, 111, 0.24)',
  },
};

// ─── NavSection ───────────────────────────────────────────────────────────────

function NavSection({
  title,
  items,
  pathname,
}: {
  title:    string;
  items:    NavItem[];
  pathname: string;
}) {
  return (
    <section style={{ display: 'grid', gap: '4px' }}>
      {/* Section label */}
      <div
        style={{
          fontSize:      '10px',
          letterSpacing: '0.13em',
          textTransform: 'uppercase',
          color:         'var(--clay)',
          padding:       '0 10px',
          fontWeight:    700,
          marginBottom:  '3px',
          opacity:       0.85,
        }}
      >
        {title}
      </div>

      <div style={{ display: 'grid', gap: '2px' }}>
        {items.map((item) => {
          const Icon   = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          const bs     = item.badge ? BADGE_STYLES[item.badge] : null;

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display:        'flex',
                alignItems:     'center',
                gap:            '9px',
                padding:        '8px 10px',
                borderRadius:   '12px',
                textDecoration: 'none',
                color:          active ? 'var(--plum)' : 'var(--taupe)',
                background:     active
                  ? 'linear-gradient(135deg, rgba(242,138,106,0.12) 0%, rgba(216,164,91,0.08) 100%)'
                  : 'transparent',
                border: active
                  ? '1px solid rgba(184, 119, 98, 0.20)'
                  : '1px solid transparent',
                boxShadow:  active ? '0 2px 10px rgba(184, 119, 98, 0.10)' : 'none',
                transition: 'all 0.16s ease',
                fontWeight: active ? 700 : 500,
                fontSize:   '13px',
              }}
            >
              {/* Icon tile */}
              <div
                style={{
                  width:        '24px',
                  height:       '24px',
                  borderRadius: '7px',
                  display:      'grid',
                  placeItems:   'center',
                  flexShrink:   0,
                  background:   active
                    ? 'rgba(242, 138, 106, 0.16)'
                    : 'rgba(107, 90, 96, 0.07)',
                  color: active ? 'var(--peach)' : 'var(--muted)',
                  transition: 'all 0.16s ease',
                }}
              >
                <Icon size={13} strokeWidth={active ? 2.2 : 1.8} />
              </div>

              {/* Label */}
              <span
                style={{
                  flex:          1,
                  minWidth:      0,
                  overflow:      'hidden',
                  textOverflow:  'ellipsis',
                  whiteSpace:    'nowrap',
                  lineHeight:    1.2,
                }}
              >
                {item.label}
              </span>

              {/* Badge */}
              {bs && (
                <span
                  style={{
                    fontSize:     '9px',
                    fontWeight:   700,
                    padding:      '2px 6px',
                    borderRadius: '6px',
                    flexShrink:   0,
                    letterSpacing:'0.03em',
                    background:   bs.bg,
                    color:        bs.color,
                    border:       `1px solid ${bs.border}`,
                  }}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Application sidebar"
      style={{
        width:        '280px',
        borderRight:  '1px solid var(--border-soft)',
        background:   'linear-gradient(180deg, rgba(255,248,242,0.97) 0%, rgba(255,241,232,0.96) 100%)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding:      '20px 12px 24px',
        display:      'grid',
        gap:          '18px',
        alignContent: 'start',
        position:     'sticky',
        top:          0,
        height:       '100vh',
        overflowY:    'auto',
        overflowX:    'hidden',
        boxShadow:    '2px 0 16px rgba(42, 32, 36, 0.06)',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(184,119,98,0.18) transparent',
      }}
    >
      {/* Wordmark */}
      <div style={{ padding: '6px 10px 4px' }}>
        <div
          style={{
            fontSize:      '18px',
            fontWeight:    800,
            color:         'var(--plum)',
            lineHeight:    1.1,
            letterSpacing: '-0.03em',
            fontFamily:    'var(--font-display), Georgia, serif',
            fontStyle:     'italic',
          }}
        >
          Sweet404Peaches
        </div>
        <div
          style={{
            color:      'var(--muted)',
            fontSize:   '11px',
            lineHeight: 1.5,
            marginTop:  '4px',
            fontStyle:  'italic',
          }}
        >
          Dream intelligence · engine-backed
        </div>

        {/* Warm divider under wordmark */}
        <div
          style={{
            height:     '1px',
            background: 'linear-gradient(90deg, var(--peach-2), var(--gold), transparent)',
            opacity:    0.5,
            marginTop:  '12px',
          }}
        />
      </div>

      <NavSection title="Dream Ledger"  items={dreamLedgerNav}  pathname={pathname} />
      <NavSection title="Results & Ops" items={resultsOpsNav}   pathname={pathname} />
      <NavSection title="Intelligence"  items={intelligenceNav} pathname={pathname} />
      <NavSection title="Backtesting"   items={backtestingNav}  pathname={pathname} />

      {/* Footer */}
      <section
        style={{
          marginTop:    'auto',
          padding:      '12px',
          borderRadius: '14px',
          border:       '1px solid var(--border-soft)',
          background:   'rgba(255, 248, 242, 0.80)',
          display:      'grid',
          gap:          '5px',
        }}
      >
        <div
          style={{
            display:    'flex',
            gap:        '8px',
            alignItems: 'center',
            color:      'var(--plum)',
          }}
        >
          <Users size={13} strokeWidth={1.8} />
          <strong style={{ fontSize: '12px' }}>Peach Ledger Studio</strong>
        </div>
        <div
          style={{
            color:      'var(--muted)',
            fontSize:   '11px',
            lineHeight: 1.4,
            fontStyle:  'italic',
          }}
        >
          Where dreams leave numbers.
        </div>
      </section>
    </aside>
  );
}
