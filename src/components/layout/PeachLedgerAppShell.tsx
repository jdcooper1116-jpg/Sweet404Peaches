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

        /* ── Phase 4.1 compatibility shim ─────────────────────────────────────
           Temporary bridge until Phase 5 removes old page wrappers manually.
           Targets legacy page structure still used by unrewired pages:

             <main style="display:grid; grid-template-columns:280px 1fr; background:#1A1A2E...">
               <aside>  ← old embedded Sidebar (now duplicate)
               <section>...</section>
             </main>

           These rules suppress the duplicate sidebar and neutralize the dark
           inline styles without touching any page file.
        ──────────────────────────────────────────────────────────────────────── */

        /* 1. Hide old embedded page sidebars (duplicate of shell sidebar) */
        #peach-main-content > main > aside:first-child {
          display: none !important;
        }

        /* 2. Neutralize old page-level grid wrapper:
              - flatten from 2-col grid to block flow
              - remove dark inline background (transparent lets body gradient show)
              - remove the 100vh min-height that fights the shell layout         */
        #peach-main-content > main {
          display: block !important;
          grid-template-columns: 1fr !important;
          background: transparent !important;
          min-height: auto !important;
        }

        /* 3. Let old inner content section fill available width */
        #peach-main-content > main > section:not(:first-child),
        #peach-main-content > main > section:first-child {
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }
      `}</style>
    </>
  );
}
