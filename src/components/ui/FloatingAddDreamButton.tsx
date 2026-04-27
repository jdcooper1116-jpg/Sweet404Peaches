'use client';

import Link from 'next/link';
import { PenLine } from 'lucide-react';

/**
 * FloatingAddDreamButton
 *
 * Mobile-only FAB that navigates to /dreams/new.
 *
 * Position: bottom-left-center (slightly left of center) so it does not
 * overlap GlobalChatDock, which mounts on the right side of the screen
 * inside the Sidebar area on desktop. On mobile the dock renders below
 * content; the FAB sits above the bottom nav (62px) with an extra 12px gap.
 *
 * Hidden on desktop via media query to keep the desktop layout clean.
 */
export default function FloatingAddDreamButton() {
  return (
    <>
      <Link
        href="/dreams/new"
        aria-label="Write a new dream"
        className="fab-add-dream"
        style={{
          position:       'fixed',
          bottom:         'calc(62px + 16px + env(safe-area-inset-bottom, 0px))',
          left:           '50%',
          transform:      'translateX(-140px)',  // slightly left of center
          zIndex:         70,
          display:        'flex',
          alignItems:     'center',
          gap:            '8px',
          padding:        '12px 20px',
          borderRadius:   '999px',
          background:     'linear-gradient(135deg, var(--peach) 0%, var(--clay) 100%)',
          color:          '#fff',
          fontWeight:     700,
          fontSize:       '14px',
          letterSpacing:  '-0.01em',
          textDecoration: 'none',
          boxShadow:      '0 6px 24px rgba(242, 138, 106, 0.42), 0 2px 8px rgba(42, 32, 36, 0.12)',
          transition:     'transform 0.18s ease, box-shadow 0.18s ease',
          whiteSpace:     'nowrap',
        }}
      >
        <PenLine size={16} strokeWidth={2.2} />
        Write a Dream
      </Link>

      {/* Hide on desktop — only show on small screens */}
      <style>{`
        @media (min-width: 768px) {
          .fab-add-dream {
            display: none !important;
          }
        }
        .fab-add-dream:active {
          transform: translateX(-140px) scale(0.96);
          box-shadow: 0 3px 14px rgba(242, 138, 106, 0.36);
        }
      `}</style>
    </>
  );
}
