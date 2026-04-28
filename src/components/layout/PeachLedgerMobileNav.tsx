'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookMarked, CalendarRange, LayoutDashboard, MoreHorizontal, MoonStar, SearchCheck } from 'lucide-react';

const ITEMS = [
  { href: '/dashboard',   label: 'Ledger',   icon: LayoutDashboard },
  { href: '/dreams/new',  label: 'Dream',    icon: MoonStar },
  { href: '/windows',     label: 'Windows',  icon: CalendarRange },
  { href: '/hits',        label: 'Hits',     icon: SearchCheck },
  { href: '/fell-before', label: 'Memory',   icon: BookMarked },
];

export default function PeachLedgerMobileNav({ onMoreOpen }: { onMoreOpen: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary navigation" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 80,
      display: 'flex', alignItems: 'stretch', height: '62px',
      paddingBottom: 'env(safe-area-inset-bottom,0px)',
      background: 'rgba(22,8,40,0.95)',
      borderTop: '1px solid rgba(255,255,255,0.10)',
      backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
      boxShadow: '0 -4px 28px rgba(0,0,0,0.40)',
    }}>
      {ITEMS.map(item => {
        const Icon   = item.icon;
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link key={item.href} href={item.href} aria-label={item.label}
            aria-current={active ? 'page' : undefined}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: '3px', minHeight: '44px', padding: '6px 4px',
              textDecoration: 'none',
              color: active ? '#ff8a6a' : 'rgba(255,255,255,0.38)',
              transition: 'color 0.18s ease', position: 'relative',
            }}>
            {active && (
              <span aria-hidden="true" style={{
                position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                width: '24px', height: '2px', borderRadius: '0 0 3px 3px',
                background: '#ff6b4a', boxShadow: '0 0 8px rgba(255,107,74,0.60)',
              }} />
            )}
            <Icon size={active ? 20 : 18} strokeWidth={active ? 2.2 : 1.7} />
            <span style={{ fontSize: '9px', fontWeight: active ? 700 : 500, letterSpacing: '0.03em', textTransform: 'uppercase', lineHeight: 1, fontFamily: 'system-ui,sans-serif' }}>
              {item.label}
            </span>
          </Link>
        );
      })}
      <button type="button" aria-label="Open more navigation options" onClick={onMoreOpen}
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: '3px', minHeight: '44px', padding: '6px 4px',
          border: 'none', background: 'transparent',
          color: 'rgba(255,255,255,0.38)', cursor: 'pointer',
        }}>
        <MoreHorizontal size={18} strokeWidth={1.7} />
        <span style={{ fontSize: '9px', fontWeight: 500, letterSpacing: '0.03em', textTransform: 'uppercase', lineHeight: 1, fontFamily: 'system-ui,sans-serif' }}>More</span>
      </button>
    </nav>
  );
}
