'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await signIn(email, password);
      router.push('/dashboard');
    } catch (err) {
      console.error(err);
      setError('Sign in failed. Check your email/password and Firebase Auth setup.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
      }}
    >
      <div
        className="journal-card"
        style={{ width: '100%', maxWidth: '520px' }}
      >
        <div className="page-header" style={{ marginBottom: '20px' }}>
          <h1>Sweet404Peaches</h1>
          <p>Where Dreams Leave Numbers.</p>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <div
            style={{
              fontSize: '12px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--ink-muted)',
              marginBottom: '8px',
            }}
          >
            Private Owner Login
          </div>
          <p style={{ margin: 0, color: 'var(--ink-light)', fontSize: '14px' }}>
            Sign in to access your dream journal, active windows, and number tracking.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label className="journal-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="journal-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="journal-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="journal-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {error ? (
            <div
              style={{
                border: '1px solid #e7b7b7',
                background: '#fff3f3',
                color: '#8a2f2f',
                borderRadius: '12px',
                padding: '12px 14px',
                fontSize: '14px',
              }}
            >
              {error}
            </div>
          ) : null}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Signing In...' : 'Enter the Journal'}
          </button>
        </form>
      </div>
    </main>
  );
}
