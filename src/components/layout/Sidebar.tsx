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

type NavItem = {
  href:    string;
  label:   string;
  icon:    any;
  badge?:  string;  // "Needs Audit" | "Legacy" | "Experimental" | "Repurpose" | undefined
};

// ─── Nav sections ──────────────────────────────────────────────────────────────

const coreNav: NavItem[] = [
  { href: '/dashboard',       label: 'Dashboard',           icon: LayoutDashboard },
  { href: '/dreams/new',      label: 'New Dream Entry',     icon: MoonStar },
  { href: '/dreams',          label: 'Dream Journal',       icon: BookOpen },
  { href: '/dreamers',        label: 'Dreamers',            icon: Users },
  { href: '/windows',         label: 'Active Windows',      icon: CalendarRange },
  { href: '/hits',            label: 'Hits Detector',       icon: SearchCheck },
  { href: '/fell-before',     label: 'As They Fell Before', icon: BookMarked },
  { href: '/dictionary',      label: 'Universal Dictionary',icon: Database },
  { href: '/results',         label: 'Results Log',         icon: ReceiptText },
];

const backtestingNav: NavItem[] = [
  { href: '/backtesting',          label: 'Backtesting Portal',        icon: Zap },
  { href: '/backtesting/intake',   label: 'Historical Dream Intake',   icon: MoonStar },
  { href: '/backtesting/replay',   label: 'Replay Lab',                icon: Activity },
  { href: '/backtesting/archive',  label: 'Backtest Archive',          icon: Trophy },
  { href: '/backtesting/evidence', label: 'Evidence Tracker',          icon: BarChart3 },
  { href: '/backtesting/results',  label: 'Legacy Results Upload',     icon: ReceiptText, badge: 'Legacy' },
];

const intelligenceNav: NavItem[] = [
  { href: '/intelligence',    label: 'Intelligence Hub',    icon: Brain,        badge: 'Needs Audit' },
  { href: '/chat',            label: 'Intelligence Chat',   icon: MessageCircleHeart, badge: 'Needs Audit' },
  { href: '/forecast-board',  label: 'Forecast Board',      icon: MapPinned,    badge: 'Needs Audit' },
  { href: '/daily-ops',       label: 'Daily Ops',           icon: Activity,     badge: 'Needs Audit' },
  { href: '/hot-numbers',     label: 'Hot Families',        icon: Flame,        badge: 'Needs Audit' },
  { href: '/playlists',       label: 'State Playlists',     icon: Sparkles,     badge: 'Needs Audit' },
  { href: '/performance',     label: 'Performance',         icon: BarChart3,    badge: 'Needs Audit' },
  { href: '/pinned-plays',    label: 'Pinned Plays',        icon: MapPinned,    badge: 'Needs Audit' },
  { href: '/universal-scope', label: 'Universal Scope',     icon: Sparkles,     badge: 'Needs Audit' },
];

const adminNav: NavItem[] = [
  { href: '/integrity',       label: 'Integrity Console',   icon: ShieldCheck },
  { href: '/results/import',  label: 'Engine Coverage',     icon: Zap },
  { href: '/results/rescan',  label: 'Dream Re-Refresh',    icon: Wrench,       badge: 'Repurpose' },
  { href: '/cleanup',         label: 'Cleanup Tools',       icon: Trash2 },
  { href: '/cleanup/owner-name', label: 'Owner Rename',     icon: Settings,     badge: 'Legacy' },
];

// ─── Badge styles ──────────────────────────────────────────────────────────────

const BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  'Needs Audit': { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24' },
  'Legacy':      { bg: 'rgba(156,163,175,0.15)', color: '#9ca3af' },
  'Experimental':{ bg: 'rgba(167,139,250,0.15)', color: '#a78bfa' },
  'Repurpose':   { bg: 'rgba(52,211,153,0.12)', color: '#34d399' },
};

// ─── NavSection component ──────────────────────────────────────────────────────

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
    <section style={{ display: 'grid', gap: '6px' }}>
      <div
        style={{
          fontSize:      '11px',
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color:         'rgba(228, 234, 242, 0.52)',
          padding:       '0 12px',
          fontWeight:    700,
          marginBottom:  '2px',
        }}
      >
        {title}
      </div>

      <div style={{ display: 'grid', gap: '3px' }}>
        {items.map((item) => {
          const Icon   = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          const badge  = item.badge;

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display:       'flex',
                alignItems:    'center',
                gap:           '10px',
                padding:       '9px 12px',
                borderRadius:  '14px',
                textDecoration:'none',
                color:          active ? '#EAEAF2' : 'rgba(234, 234, 242, 0.72)',
                background:     active
                  ? 'linear-gradient(135deg, rgba(228,192,123,0.16) 0%, rgba(73,99,201,0.12) 100%)'
                  : 'transparent',
                border:         active
                  ? '1px solid rgba(228,192,123,0.20)'
                  : '1px solid transparent',
                boxShadow:      active ? '0 8px 20px rgba(7,11,28,0.24)' : 'none',
                transition:     'all 0.18s ease',
                fontWeight:     active ? 700 : 500,
                fontSize:       '13.5px',
              }}
            >
              <div
                style={{
                  width:        '26px',
                  height:       '26px',
                  borderRadius: '8px',
                  display:      'grid',
                  placeItems:   'center',
                  flexShrink:   0,
                  background:   active
                    ? 'rgba(228,192,123,0.16)'
                    : 'rgba(255,255,255,0.04)',
                }}
              >
                <Icon size={14} />
              </div>

              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.label}
              </span>

              {badge && (
                <span
                  style={{
                    fontSize:     '9px',
                    fontWeight:   700,
                    padding:      '2px 6px',
                    borderRadius: '6px',
                    flexShrink:   0,
                    letterSpacing:'0.03em',
                    background:   BADGE_STYLES[badge]?.bg   ?? 'rgba(255,255,255,0.08)',
                    color:        BADGE_STYLES[badge]?.color ?? 'rgba(255,255,255,0.5)',
                  }}
                >
                  {badge}
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
      style={{
        borderRight:   '1px solid rgba(228,192,123,0.10)',
        background:    'linear-gradient(180deg, rgba(8,14,36,0.96) 0%, rgba(15,23,52,0.98) 100%)',
        padding:       '20px 14px 24px',
        display:       'grid',
        gap:           '20px',
        alignContent:  'start',
        position:      'sticky',
        top:           0,
        height:        '100vh',
        overflowY:     'auto',
        boxShadow:     'inset -1px 0 0 rgba(255,255,255,0.03)',
      }}
    >
      {/* Wordmark */}
      <div style={{ padding: '6px 12px 2px' }}>
        <div style={{ fontSize: '19px', fontWeight: 800, color: '#EAEAF2', lineHeight: 1.1, letterSpacing: '-0.03em' }}>
          Sweet404Peaches
        </div>
        <div style={{ color: 'rgba(234,234,242,0.50)', fontSize: '11.5px', lineHeight: 1.5, marginTop: '4px' }}>
          Dream intelligence · engine-backed
        </div>
      </div>

      <NavSection title="Core"          items={coreNav}          pathname={pathname} />
      <NavSection title="Backtesting"   items={backtestingNav}   pathname={pathname} />
      <NavSection title="Intelligence"  items={intelligenceNav}  pathname={pathname} />
      <NavSection title="Admin / Tools" items={adminNav}         pathname={pathname} />

      {/* Footer identity */}
      <section
        style={{
          marginTop:    'auto',
          padding:      '12px',
          borderRadius: '16px',
          border:       '1px solid rgba(228,192,123,0.10)',
          background:   'rgba(255,255,255,0.03)',
          display:      'grid',
          gap:          '6px',
          color:        '#EAEAF2',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Users size={14} />
          <strong style={{ fontSize: '13px' }}>Sweet404Peaches</strong>
        </div>
        <div style={{ color: 'rgba(234,234,242,0.50)', fontSize: '11.5px', lineHeight: 1.4 }}>
          Premium dream intelligence control center.
        </div>
      </section>
    </aside>
  );
}
