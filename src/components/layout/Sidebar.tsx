'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
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
} from 'lucide-react';

type NavItem = {
  href: string;
  label: string;
  icon: any;
};

const primaryNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dreams/new', label: 'New Dream Entry', icon: MoonStar },
  { href: '/results/import', label: 'Results Import', icon: ReceiptText },
  { href: '/hits', label: 'Hits Detector', icon: SearchCheck },
  { href: '/fell-before', label: 'As They Fell Before', icon: BookOpen },
  { href: '/forecast-board', label: 'Forecast Board', icon: MapPinned },
  { href: '/daily-ops', label: 'Daily Ops', icon: Activity },
  { href: '/chat', label: 'Intelligence Chat', icon: MessageCircleHeart },
];

const intelligenceNav: NavItem[] = [
  { href: '/intelligence', label: 'Intelligence Hub', icon: Brain },
  { href: '/hot-numbers', label: 'Hot Families', icon: Flame },
  { href: '/performance', label: 'Performance', icon: BarChart3 },
  { href: '/playlists', label: 'State Playlists', icon: Sparkles },
  { href: '/universal-scope', label: 'Universal Dictionary', icon: BookMarked },
];

const researchNav: NavItem[] = [
  { href: '/backtesting', label: 'Backtesting Portal', icon: CalendarRange },
  { href: '/backtesting/intake', label: 'Historical Dream Intake', icon: MoonStar },
  { href: '/backtesting/results', label: 'Historical Results Intake', icon: ReceiptText },
  { href: '/backtesting/replay', label: 'Replay Lab', icon: Activity },
  { href: '/backtesting/archive', label: 'Backtest Archive', icon: Trophy },
  { href: '/backtesting/evidence', label: 'Evidence Rules', icon: Database },
];

const adminNav: NavItem[] = [
  { href: '/integrity', label: 'Integrity Console', icon: ShieldCheck },
  { href: '/cleanup', label: 'Cleanup Tools', icon: Trash2 },
];

function NavSection({
  title,
  items,
  pathname,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <section style={{ display: 'grid', gap: '8px' }}>
      <div
        style={{
          fontSize: '12px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--ink-light)',
          padding: '0 10px',
        }}
      >
        {title}
      </div>

      <div style={{ display: 'grid', gap: '6px' }}>
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(item.href + '/');

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '14px',
                textDecoration: 'none',
                color: active ? 'var(--ink)' : 'var(--ink-light)',
                background: active ? 'rgba(201, 168, 76, 0.14)' : 'transparent',
                border: active
                  ? '1px solid rgba(201, 168, 76, 0.22)'
                  : '1px solid transparent',
                transition: 'all 0.18s ease',
                fontWeight: active ? 700 : 500,
              }}
            >
              <Icon size={18} />
              <span>{item.label}</span>
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
    <aside
      style={{
        borderRight: '1px solid rgba(90, 52, 74, 0.08)',
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(255,250,240,0.88) 100%)',
        padding: '24px 16px',
        display: 'grid',
        gap: '24px',
        alignContent: 'start',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          padding: '8px 10px 0 10px',
          display: 'grid',
          gap: '6px',
        }}
      >
        <div
          style={{
            fontSize: '22px',
            fontWeight: 800,
            color: 'var(--ink)',
            lineHeight: 1.1,
          }}
        >
          Sweet404Peaches
        </div>
        <div style={{ color: 'var(--ink-light)', fontSize: '13px', lineHeight: 1.5 }}>
          Dream intelligence, hit tracking, research replay, and forecast learning.
        </div>
      </div>

      <NavSection title="Primary" items={primaryNav} pathname={pathname} />
      <NavSection title="Intelligence" items={intelligenceNav} pathname={pathname} />
      <NavSection title="Research" items={researchNav} pathname={pathname} />
      <NavSection title="Admin" items={adminNav} pathname={pathname} />

      <section
        className="journal-card-flat"
        style={{ marginTop: 'auto', display: 'grid', gap: '10px' }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Users size={16} />
          <strong>Sweet404Peaches</strong>
        </div>
        <div style={{ color: 'var(--ink-light)', fontSize: '13px', lineHeight: 1.5 }}>
          Personal dream intelligence control center.
        </div>
      </section>
    </aside>
  );
}
