'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';

import PeachLedgerMobileNav from './PeachLedgerMobileNav';
import MoreMenuDrawer from './MoreMenuDrawer';
import FloatingAddDreamButton from '../ui/FloatingAddDreamButton';

/**
 * PeachLedgerAppShell
 *
 * Responsive application wrapper.
 *
 * Desktop (≥768px):
 *   ┌─────────┬──────────────────────────┐
 *   │ Sidebar │  {children}              │
 *   │ (slot)  │                          │
 *   └─────────┴──────────────────────────┘
 *
 *   The sidebar slot is currently empty — Phase 3 (layout.tsx) will insert
 *   the existing Sidebar component directly here once the warm palette is in
 *   place. This shell is intentionally sidebar-agnostic in Phase 2 so that
 *   build continues to pass.
 *
 * Mobile (<768px):
 *   ┌──────────────────────────┐
 *   │  {children}              │
 *   │                          │
 *   ├──────────────────────────┤
 *   │  PeachLedgerMobileNav    │  (fixed bottom)
 *   └──────────────────────────┘
 *   + MoreMenuDrawer (slide-up)
 *   + FloatingAddDreamButton (FAB)
 *
 * Auth route bypass:
 *   Paths starting with /login render children bare — no shell, no nav.
 *
 * GlobalChatDock:
 *   The dock is mounted in layout.tsx outside this shell. On mobile the dock
 *   content area sits inside the scrollable content column. Bottom padding
 *   (paddingBottom: 'calc(62px + 8px + env(safe-area-inset-bottom, 0px))')
 *   prevents page content from hiding behind the bottom nav. The dock itself
 *   must clear the nav independently — Phase 2 keeps that responsibility in
 *   GlobalChatDock.tsx (already has `marginTop: 12px` in its outer wrapper).
 */
export default function PeachLedgerAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname                  = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Auth bypass ──────────────────────────────────────────────────────────
  const isAuthRoute = pathname.startsWith('/login');
  if (isAuthRoute) {
    return <>{children}</>;
  }

  return (
    <>
      {/* ── Desktop layout ──────────────────────────────────────────────── */}
      {/*
        The outer wrapper only provides the two-column grid on desktop.
        The background gradient comes from body in globals.css.

        SIDEBAR SLOT NOTE (Phase 2):
        The left column is currently empty. In Phase 3, layout.tsx will be
        updated to pass the Sidebar through this shell (or the shell will
        import it directly once Sidebar.tsx has been reskinned in Phase 4).
        The column is held open with minWidth so the content column does not
        jump when the sidebar is eventually added.
      */}
      <div
        style={{
          display:               'grid',
          gridTemplateColumns:   '0 1fr',     // sidebar slot = 0 until Phase 3/4
          minHeight:             '100vh',
        }}
        className="peach-shell-desktop-grid"
      >
        {/* Sidebar slot — Phase 3/4 will populate this */}
        <aside
          aria-label="Desktop sidebar (placeholder)"
          style={{
            /* hidden until Sidebar is wired in Phase 3/4 */
            display: 'none',
          }}
        />

        {/* ── Content column ─────────────────────────────────────────── */}
        <main
          id="peach-main-content"
          style={{
            minWidth:     0,
            /* On mobile, leave room for fixed bottom nav */
            paddingBottom: 'calc(62px + 8px + env(safe-area-inset-bottom, 0px))',
          }}
          className="peach-shell-content"
        >
          {children}
        </main>
      </div>

      {/* ── Mobile nav — shown only on small screens ──────────────────── */}
      <div className="peach-mobile-shell">
        <PeachLedgerMobileNav onMoreOpen={() => setDrawerOpen(true)} />
        <MoreMenuDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
        <FloatingAddDreamButton />
      </div>

      {/* ── Responsive rules ─────────────────────────────────────────── */}
      <style>{`
        /* Hide mobile shell entirely on desktop */
        @media (min-width: 768px) {
          .peach-mobile-shell {
            display: none !important;
          }
          /* Remove mobile bottom padding on desktop */
          .peach-shell-content {
            padding-bottom: 0 !important;
          }
          /* Desktop: sidebar slot uses natural sidebar width (Phase 3/4 will set 280px) */
          .peach-shell-desktop-grid {
            grid-template-columns: 0 1fr;
          }
        }

        /* Mobile: ensure no horizontal overflow */
        @media (max-width: 767px) {
          .peach-shell-desktop-grid {
            grid-template-columns: 1fr !important;
          }
          .peach-shell-desktop-grid > aside {
            display: none !important;
          }
          /* Prevent any page-level horizontal scroll */
          #peach-main-content {
            overflow-x: hidden;
            max-width: 100vw;
          }
        }
      `}</style>
    </>
  );
}
