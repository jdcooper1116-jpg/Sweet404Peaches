import { Suspense } from 'react';
import DreamJournalPageClient from './DreamJournalPageClient';

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="p-6">
          <h1 className="text-2xl font-semibold">Dream Journal</h1>
          <p>Loading...</p>
        </main>
      }
    >
      <DreamJournalPageClient />
    </Suspense>
  );
}
