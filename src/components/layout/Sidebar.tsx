'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity, Archive, BarChart3, BookMarked, BookOpen, Brain,
  CalendarRange, Database, Flame, LayoutDashboard, MapPinned,
  MessageCircleHeart, MoonStar, PenLine, ReceiptText, SearchCheck,
  Settings, ShieldCheck, Sparkles, Trophy, Trash2, Users, Wrench, Zap,
} from 'lucide-react';

type BadgeKind = 'Legacy' | 'Needs Audit' | 'Repurpose' | 'Experimental';
type NavItem = { href: string; label: string; icon: any; badge?: BadgeKind; };

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
  { href: '/results',        label: 'Results Log',       icon: ReceiptText },
  { href: '/results/import', label: 'Engine Coverage',   icon: Zap },
  { href: '/results/rescan', label: 'Dream Re-Refresh',  icon: Wrench },
  { href: '/daily-ops',      label: 'Daily Ops',         icon: Activity },
  { href: '/integrity',      label: 'Integrity Console', icon: ShieldCheck },
  { href: '/cleanup',        label: 'Cleanup Tools',     icon: Trash2 },
];
const intelligenceNav: NavItem[] = [
  { href: '/intelligence',   label: 'Intelligence Hub',  icon: Brain },
  { href: '/chat',           label: 'Intelligence Chat', icon: MessageCircleHeart },
  { href: '/forecast-board', label: 'Forecast Board',    icon: MapPinned },
  { href: '/hot-numbers',    label: 'Hot Families',      icon: Flame },
  { href: '/playlists',      label: 'State Playlists',   icon: Sparkles },
  { href: '/performance',    label: 'Performance',       icon: BarChart3 },
  { href: '/pinned-plays',   label: 'Pinned Plays',      icon: MapPinned },
  { href: '/universal-scope',label: 'Universal Scope',   icon: Sparkles },
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

const BADGE: Record<BadgeKind, { bg: string; color: string; border: string }> = {
  'Needs Audit':  { bg: 'rgba(255,204,80,0.12)',  color: '#ffcc50', border: 'rgba(255,204,80,0.28)'  },
  'Legacy':       { bg: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)', border: 'rgba(255,255,255,0.16)' },
  'Repurpose':    { bg: 'rgba(96,224,154,0.12)',  color: '#60e09a', border: 'rgba(96,224,154,0.28)'  },
  'Experimental': { bg: 'rgba(160,144,255,0.12)', color: '#a090ff', border: 'rgba(160,144,255,0.28)' },
};

function NavSection({ title, items, pathname }: { title: string; items: NavItem[]; pathname: string }) {
  return (
    <section style={{ display: 'grid', gap: '2px' }}>
      <div style={{
        fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'rgba(160,144,255,0.55)', padding: '0 8px', fontWeight: 700,
        marginBottom: '3px', fontFamily: 'system-ui,-apple-system,sans-serif',
      }}>{title}</div>
      <div style={{ display: 'grid', gap: '1px' }}>
        {items.map(item => {
          const Icon   = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          const bs     = item.badge ? BADGE[item.badge] : null;
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: '9px', padding: '7px 9px',
              borderRadius: '12px', textDecoration: 'none',
              color: active ? '#ffffff' : 'rgba(255,255,255,0.52)',
              background: active
                ? 'linear-gradient(135deg,rgba(255,107,74,0.22) 0%,rgba(160,144,255,0.14) 100%)'
                : 'transparent',
              border: active ? '1px solid rgba(255,107,74,0.25)' : '1px solid transparent',
              transition: 'all 0.15s ease', fontWeight: active ? 700 : 400, fontSize: '12.5px',
              fontFamily: 'system-ui,-apple-system,sans-serif',
            }}>
              <div style={{
                width: '24px', height: '24px', borderRadius: '7px', display: 'grid',
                placeItems: 'center', flexShrink: 0,
                background: active ? 'rgba(255,107,74,0.22)' : 'rgba(255,255,255,0.06)',
                color: active ? '#ff8a6a' : 'rgba(255,255,255,0.38)',
                transition: 'all 0.15s ease',
              }}>
                <Icon size={12} strokeWidth={active ? 2.2 : 1.7} />
              </div>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                {item.label}
              </span>
              {bs && (
                <span style={{
                  fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '6px',
                  flexShrink: 0, letterSpacing: '0.02em',
                  background: bs.bg, color: bs.color, border: `1px solid ${bs.border}`,
                }}>{item.badge}</span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside aria-label="Application sidebar" style={{
      width: '272px',
      borderRight: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(22,8,40,0.92)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      padding: '18px 10px 24px',
      display: 'grid', gap: '16px', alignContent: 'start',
      position: 'sticky', top: 0, height: '100vh',
      overflowY: 'auto', overflowX: 'hidden',
      scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,107,74,0.20) transparent',
    }}>
      {/* Wordmark */}
      <div style={{ padding: '6px 10px 4px' }}>
        <div style={{
          fontSize: '17px', fontWeight: 900, letterSpacing: '-0.04em',
          fontFamily: 'system-ui,-apple-system,sans-serif',
          background: 'linear-gradient(135deg, #ff8a6a, #a090ff)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>Sweet404Peaches</div>
        <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '10.5px', marginTop: '3px', letterSpacing: '0.02em' }}>
          Dream intelligence · engine-backed
        </div>
        <div style={{
          height: '1px', marginTop: '14px',
          background: 'linear-gradient(90deg, rgba(255,107,74,0.5), rgba(160,144,255,0.5), transparent)',
        }} />
      </div>

      <NavSection title="Dream Ledger"  items={dreamLedgerNav}  pathname={pathname} />
      <NavSection title="Results & Ops" items={resultsOpsNav}   pathname={pathname} />
      <NavSection title="Intelligence"  items={intelligenceNav} pathname={pathname} />
      <NavSection title="Backtesting"   items={backtestingNav}  pathname={pathname} />

      {/* Footer */}
      <section style={{
        marginTop: 'auto', padding: '11px 12px', borderRadius: '14px',
        border: '1px solid rgba(255,107,74,0.15)',
        background: 'rgba(255,107,74,0.06)',
        display: 'grid', gap: '4px',
      }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Users size={12} strokeWidth={1.8} color="rgba(255,138,106,0.80)" />
          <strong style={{ fontSize: '11px', fontFamily: 'system-ui,sans-serif', color: 'rgba(255,255,255,0.80)' }}>
            Peach Ledger Studio
          </strong>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.30)', fontSize: '10.5px' }}>
          Where dreams leave numbers.
        </div>
      </section>
    </aside>
  );
}
