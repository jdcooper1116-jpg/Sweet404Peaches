'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

export default function NewDreamPageClient() {
  const searchParams = useSearchParams();

  const [dreamerId, setDreamerId] = useState(searchParams.get('dreamerId') ?? '');
  const [dreamTitle, setDreamTitle] = useState('');
  const [dreamText, setDreamText] = useState('');

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">New Dream</h1>

      <div className="space-y-4">
        <div>
          <label className="block mb-1 font-medium">Dreamer ID</label>
          <input
            value={dreamerId}
            onChange={(e) => setDreamerId(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="Enter dreamer ID"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">Dream Title</label>
          <input
            value={dreamTitle}
            onChange={(e) => setDreamTitle(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="Enter dream title"
          />
        </div>

        <div>
          <label className="block mb-1 font-medium">Dream Description</label>
          <textarea
            value={dreamText}
            onChange={(e) => setDreamText(e.target.value)}
            className="w-full border rounded px-3 py-2 min-h-[180px]"
            placeholder="Describe the dream here..."
          />
        </div>

        <button
          type="button"
          className="px-4 py-2 rounded bg-black text-white"
        >
          Save Dream
        </button>
      </div>
    </main>
  );
}
