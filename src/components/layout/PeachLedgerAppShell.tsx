'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';

import Sidebar from './Sidebar';
import PeachLedgerMobileNav from './PeachLedgerMobileNav';
import MoreMenuDrawer from './MoreMenuDrawer';
import FloatingAddDreamButton from '../ui/FloatingAddDreamButton';

/**
 * PeachLedgerAppShell  (Phase 4)
 *
 * Desktop (≥768px):
 *   ┌──────────────────┬──────────────────────────────┐
 *   │  Sidebar (280px) │  {children}                  │
 *   │  warm cream      │  min-width: 0                │
 *   └──────────────────┴──────────────────────────────┘
 *
 * Mobile (<768px):
 *   ┌──────────────────────────────┐
 *   │  {children}  (full width)    │
 *   ├──────────────────────────────┤  ← bottom nav fixed
 *   │  PeachLedgerMobileNav        │
 *   └──────────────────────────────┘
 *   + MoreMenuDrawer (slide-up)
 *   + FloatingAddDreamButton (FAB)
 *
 * Auth bypass:
 *   /login → bare children, no shell, no sidebar, no nav.
 *
 * GlobalChatDock:
 *   Mounted in layout.tsx as a sibling of this shell (outside).
 *   On desktop it renders inside the Sidebar area.
 *   Bottom padding on mobile content clears the fixed bottom nav.
 */
export default function PeachLedgerAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname                    = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Auth bypass ────────────────────────────────────────────────────────────
  if (pathname.startsWith('/login')) {
    return <>{children}</>;
  }

  return (
    <>
      {/* ── Desktop + mobile content wrapper ──────────────────────────────── */}
      <div className="peach-shell-grid">

        {/* Desktop sidebar — hidden on mobile via CSS */}
        <div className="peach-shell-sidebar">
          <Sidebar />
        </div>

        {/* Content column */}
        <main
          id="peach-main-content"
          className="peach-shell-content"
          style={{ minWidth: 0 }}
        >
          {children}
        </main>
      </div>

      {/* ── Mobile-only shell elements ─────────────────────────────────────── */}
      <div className="peach-mobile-shell">
        <PeachLedgerMobileNav onMoreOpen={() => setDrawerOpen(true)} />
        <MoreMenuDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
        <FloatingAddDreamButton />
      </div>

      {/* ── Responsive rules ──────────────────────────────────────────────── */}
      <style>{`
        /* ── Desktop: two-column grid ──────────────────────────────────────── */
        .peach-shell-grid {
          display: grid;
          grid-template-columns: 280px 1fr;
          min-height: 100vh;
        }

        /* ── Desktop: sidebar visible ─────────────────────────────────────── */
        .peach-shell-sidebar {
          /* sticky positioning is handled inside Sidebar.tsx itself */
        }

        /* ── Desktop: no mobile padding on content ────────────────────────── */
        .peach-shell-content {
          /* no padding-bottom needed on desktop */
        }

        /* ── Desktop: hide mobile-only elements ───────────────────────────── */
        @media (min-width: 768px) {
          .peach-mobile-shell {
            display: none !important;
          }
        }

        /* ── Mobile: single column, hide sidebar ──────────────────────────── */
        @media (max-width: 767px) {
          .peach-shell-grid {
            grid-template-columns: 1fr !important;
          }

          .peach-shell-sidebar {
            display: none !important;
          }

          /* Leave room for fixed bottom nav + safe area */
          .peach-shell-content {
            padding-bottom: calc(62px + 12px + env(safe-area-inset-bottom, 0px));
          }

          /* Prevent any horizontal overflow on small screens */
          #peach-main-content {
            overflow-x: hidden;
            max-width: 100vw;
          }
        }
      `}</style>
    </>
  );
}
