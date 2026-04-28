import type { Metadata } from 'next';
import { Lora } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/contexts/AuthContext';
import GlobalChatDock from '@/components/chat/GlobalChatDock';
import PeachLedgerAppShell from '@/components/layout/PeachLedgerAppShell';

const lora = Lora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Sigil & Slumber',
    template: '%s — Sigil & Slumber',
  },
  description: 'Dreams decoded. Numbers revealed.',
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={lora.variable}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <AuthProvider>
          <PeachLedgerAppShell>
            {children}
          </PeachLedgerAppShell>
          <GlobalChatDock />
        </AuthProvider>
      </body>
    </html>
  );
}
