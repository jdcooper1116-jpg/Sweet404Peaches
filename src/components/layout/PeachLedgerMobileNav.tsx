'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookMarked,
  CalendarRange,
  LayoutDashboard,
  MoreHorizontal,
  MoonStar,
  SearchCheck,
} from 'lucide-react';

type PrimaryNavItem = {
  href:  string;
  label: string;
  icon:  React.ComponentType<{ size?: number; strokeWidth?: number }>;
  matchPrefix?: string;   // treat any path starting with this as active
};

const PRIMARY_ITEMS: PrimaryNavItem[] = [
  { href: '/dashboard',   label: 'Ledger',    icon: LayoutDashboard },
  { href: '/dreams/new',  label: 'Dream',     icon: MoonStar },
  { href: '/windows',     label: 'Windows',   icon: CalendarRange },
  { href: '/hits',        label: 'Hits',      icon: SearchCheck },
  { href: '/fell-before', label: 'Fell Before', icon: BookMarked },
];

type Props = {
  onMoreOpen: () => void;
};

export default function PeachLedgerMobileNav({ onMoreOpen }: Props) {
  const pathname = usePathname();

  function isActive(item: PrimaryNavItem): boolean {
    const prefix = item.matchPrefix ?? item.href;
    return pathname === item.href || pathname.startsWith(prefix + '/');
  }

  return (
    <>
      {/* Bottom nav bar */}
      <nav
        aria-label="Primary navigation"
        style={{
          position:         'fixed',
          bottom:           0,
          left:             0,
          right:            0,
          zIndex:           80,
          display:          'flex',
          alignItems:       'stretch',
          height:           '62px',
          paddingBottom:    'env(safe-area-inset-bottom, 0px)',
          background:       'rgba(255, 248, 242, 0.96)',
          borderTop:        '1px solid var(--border-muted)',
          backdropFilter:   'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow:        '0 -4px 24px rgba(42, 32, 36, 0.08)',
        }}
      >
        {PRIMARY_ITEMS.map(item => {
          const Icon    = item.icon;
          const active  = isActive(item);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              style={{
                flex:           1,
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                justifyContent: 'center',
                gap:            '3px',
                minHeight:      '44px',
                padding:        '6px 4px',
                textDecoration: 'none',
                color:          active ? 'var(--peach)' : 'var(--muted)',
                transition:     'color 0.18s ease',
                position:       'relative',
              }}
            >
              {/* Active pip */}
              {active && (
                <span
                  aria-hidden="true"
                  style={{
                    position:     'absolute',
                    top:          0,
                    left:         '50%',
                    transform:    'translateX(-50%)',
                    width:        '24px',
                    height:       '2px',
                    borderRadius: '0 0 2px 2px',
                    background:   'var(--peach)',
                  }}
                />
              )}

              <Icon
                size={active ? 22 : 20}
                strokeWidth={active ? 2.2 : 1.8}
              />
              <span
                style={{
                  fontSize:      '9px',
                  fontWeight:    active ? 700 : 500,
                  letterSpacing: '0.03em',
                  lineHeight:    1,
                  textTransform: 'uppercase',
                }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* More button */}
        <button
          type="button"
          aria-label="Open more navigation options"
          onClick={onMoreOpen}
          style={{
            flex:           1,
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            gap:            '3px',
            minHeight:      '44px',
            padding:        '6px 4px',
            border:         'none',
            background:     'transparent',
            color:          'var(--muted)',
            cursor:         'pointer',
            transition:     'color 0.18s ease',
          }}
        >
          <MoreHorizontal size={20} strokeWidth={1.8} />
          <span
            style={{
              fontSize:      '9px',
              fontWeight:    500,
              letterSpacing: '0.03em',
              lineHeight:    1,
              textTransform: 'uppercase',
            }}
          >
            More
          </span>
        </button>
      </nav>
    </>
  );
}
