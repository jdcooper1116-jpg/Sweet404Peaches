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
  { href: '/results', label: 'Results Log', icon: ReceiptText },
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
          fontSize: '11px',
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
          color: 'rgba(228, 234, 242, 0.52)',
          padding: '0 12px',
          fontWeight: 700,
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
                gap: '12px',
                padding: '11px 12px',
                borderRadius: '16px',
                textDecoration: 'none',
                color: active ? '#EAEAF2' : 'rgba(234, 234, 242, 0.72)',
                background: active
                  ? 'linear-gradient(135deg, rgba(228, 192, 123, 0.16) 0%, rgba(73, 99, 201, 0.12) 100%)'
                  : 'transparent',
                border: active
                  ? '1px solid rgba(228, 192, 123, 0.20)'
                  : '1px solid transparent',
                boxShadow: active ? '0 8px 20px rgba(7, 11, 28, 0.24)' : 'none',
                transition: 'all 0.18s ease',
                fontWeight: active ? 700 : 500,
              }}
            >
              <div
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '10px',
                  display: 'grid',
                  placeItems: 'center',
                  background: active
                    ? 'rgba(228, 192, 123, 0.16)'
                    : 'rgba(255,255,255,0.04)',
                }}
              >
                <Icon size={16} />
              </div>
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
        borderRight: '1px solid rgba(228, 192, 123, 0.10)',
        background:
          'linear-gradient(180deg, rgba(8, 14, 36, 0.96) 0%, rgba(15, 23, 52, 0.98) 100%)',
        padding: '24px 16px',
        display: 'grid',
        gap: '24px',
        alignContent: 'start',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
        boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.03)',
      }}
    >
      <div
        style={{
          padding: '8px 12px 4px 12px',
          display: 'grid',
          gap: '8px',
        }}
      >
        <div
          style={{
            fontSize: '22px',
            fontWeight: 800,
            color: '#EAEAF2',
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
          }}
        >
          Sweet404Peaches
        </div>
        <div
          style={{
            color: 'rgba(234, 234, 242, 0.64)',
            fontSize: '13px',
            lineHeight: 1.55,
          }}
        >
          Celestial intelligence, research replay, and state-by-state forecasting.
        </div>
      </div>

      <NavSection title="Primary" items={primaryNav} pathname={pathname} />
      <NavSection title="Intelligence" items={intelligenceNav} pathname={pathname} />
      <NavSection title="Research" items={researchNav} pathname={pathname} />
      <NavSection title="Admin" items={adminNav} pathname={pathname} />

      <section
        style={{
          marginTop: 'auto',
          padding: '14px',
          borderRadius: '18px',
          border: '1px solid rgba(228, 192, 123, 0.10)',
          background: 'rgba(255,255,255,0.03)',
          display: 'grid',
          gap: '10px',
          color: '#EAEAF2',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Users size={16} />
          <strong>Sweet404Peaches</strong>
        </div>
        <div style={{ color: 'rgba(234, 234, 242, 0.62)', fontSize: '13px', lineHeight: 1.5 }}>
          Premium dream intelligence control center.
        </div>
      </section>
    </aside>
  );
}
