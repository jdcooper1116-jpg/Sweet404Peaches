'use client';

import { FormEvent, useState } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';

const featureCards = [
  {
    title: 'Dream Journal',
    body: 'Capture dreams, symbols, dates, dreamers, and mapped numbers in one private ledger.',
  },
  {
    title: 'Universal Dictionary',
    body: 'Build a living dream-number dictionary from active dreams, replay learning, and recurring symbols.',
  },
  {
    title: 'As They Fell Before',
    body: 'Preserve confirmed hit memory by dreamer, term, number, state, and match type.',
  },
  {
    title: 'Collective Intelligence',
    body: 'Track cross-dreamer convergence, boxed families, state support, and focus signals.',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
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
    <main style={pageStyle}>
      <div aria-hidden="true" style={glowStyle} />

      <section style={shellStyle}>
        <div style={heroStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
            <div style={logoWrapStyle}>
              <img
                src="/brand/sigil-slumber-logo.png"
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'relative', zIndex: 2 }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <span style={logoFallbackStyle}>S</span>
            </div>

            <div>
              <div style={eyebrowStyle}>Private Dream Intelligence</div>
              <div style={{ marginTop: '5px', color: 'rgba(255,255,255,0.70)' }}>
                Dreams decoded. Numbers revealed.
              </div>
            </div>
          </div>

          <h1 style={titleStyle}>
            Sigil &<br />Slumber
          </h1>

          <p style={subtitleStyle}>
            Every dream is a sigil. Track symbols, numbers, dreamer memory, state evidence,
            and collective convergence through one living intelligence system.
          </p>

          <div style={featureGridStyle}>
            {featureCards.map(card => (
              <div key={card.title} style={featureCardStyle}>
                <strong style={{ display: 'block', color: '#fff', fontSize: '15px' }}>{card.title}</strong>
                <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.62)', fontSize: '13px', lineHeight: 1.55 }}>
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div style={loginCardStyle}>
          <div style={{ marginBottom: '22px' }}>
            <div style={eyebrowStyle}>Owner Login</div>
            <h2 style={{ margin: '10px 0 0', fontSize: '32px', lineHeight: 1, letterSpacing: '-0.04em' }}>
              Enter the journal
            </h2>
            <p style={{ margin: '12px 0 0', color: 'rgba(255,255,255,0.64)', lineHeight: 1.6 }}>
              Access active windows, dreamer dictionaries, fell-before memory, and focused plays.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '16px' }}>
            <div>
              <label htmlFor="email" style={labelStyle}>Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                style={inputStyle}
              />
            </div>

            <div>
              <label htmlFor="password" style={labelStyle}>Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                style={inputStyle}
              />
            </div>

            {error ? (
              <div style={errorStyle}>
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              style={{
                marginTop: '4px',
                border: 0,
                borderRadius: '18px',
                padding: '15px 18px',
                cursor: submitting ? 'not-allowed' : 'pointer',
                background: submitting
                  ? 'rgba(255,255,255,0.18)'
                  : 'linear-gradient(135deg, #ff765e, #e4c07b)',
                color: '#18071f',
                fontWeight: 900,
                fontSize: '15px',
                boxShadow: submitting ? 'none' : '0 18px 34px rgba(255,118,94,0.24)',
              }}
            >
              {submitting ? 'Signing in…' : 'Enter Sigil & Slumber'}
            </button>
          </form>

          <div style={privacyNoteStyle}>
            Private owner access only. Keep dreamer data, terms, and evidence protected.
          </div>
        </div>
      </section>

      <style>{`
        @media (max-width: 920px) {
          .sigil-login-shell {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: 'clamp(18px, 4vw, 48px)',
  background:
    'radial-gradient(circle at 12% 12%, rgba(138,92,246,0.30), transparent 30%), radial-gradient(circle at 86% 18%, rgba(255,108,82,0.24), transparent 32%), radial-gradient(circle at 50% 100%, rgba(228,192,123,0.14), transparent 36%), #080014',
  color: '#fff',
  overflow: 'hidden',
  position: 'relative',
};

const glowStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background:
    'linear-gradient(135deg, rgba(255,255,255,0.04), transparent 40%), radial-gradient(circle at 50% 40%, rgba(255,255,255,0.06), transparent 20%)',
  pointerEvents: 'none',
};

const shellStyle: CSSProperties = {
  width: '100%',
  maxWidth: '1180px',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.1fr) minmax(340px, 0.72fr)',
  gap: 'clamp(22px, 4vw, 42px)',
  alignItems: 'center',
  position: 'relative',
  zIndex: 1,
};

const heroStyle: CSSProperties = {
  borderRadius: '34px',
  padding: 'clamp(28px, 5vw, 56px)',
  border: '1px solid rgba(255,255,255,0.14)',
  background:
    'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03)), radial-gradient(circle at 18% 12%, rgba(228,192,123,0.16), transparent 34%)',
  boxShadow: '0 28px 90px rgba(0,0,0,0.38)',
  backdropFilter: 'blur(22px)',
};

const logoWrapStyle: CSSProperties = {
  width: '62px',
  height: '62px',
  borderRadius: '22px',
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(135deg, #ff765e, #e4c07b)',
  boxShadow: '0 18px 44px rgba(255,118,94,0.28)',
  overflow: 'hidden',
  position: 'relative',
  flexShrink: 0,
};

const logoFallbackStyle: CSSProperties = {
  position: 'absolute',
  fontSize: '24px',
  fontWeight: 900,
  color: '#18071f',
  zIndex: 1,
};

const eyebrowStyle: CSSProperties = {
  color: '#e4c07b',
  fontSize: '12px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  fontWeight: 900,
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 'clamp(3.2rem, 7vw, 6.8rem)',
  lineHeight: 0.88,
  letterSpacing: '-0.075em',
  fontWeight: 950,
  textShadow: '0 6px 0 rgba(255,118,94,0.22)',
};

const subtitleStyle: CSSProperties = {
  margin: '26px 0 0',
  maxWidth: '720px',
  color: 'rgba(255,255,255,0.76)',
  fontSize: 'clamp(1.05rem, 1.5vw, 1.28rem)',
  lineHeight: 1.7,
};

const featureGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
  gap: '14px',
  marginTop: '34px',
};

const featureCardStyle: CSSProperties = {
  borderRadius: '22px',
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.055)',
  padding: '18px',
};

const loginCardStyle: CSSProperties = {
  borderRadius: '30px',
  padding: '28px',
  border: '1px solid rgba(255,255,255,0.16)',
  background: 'linear-gradient(180deg, rgba(31,18,48,0.86), rgba(18,8,32,0.94))',
  boxShadow: '0 28px 80px rgba(0,0,0,0.42)',
  backdropFilter: 'blur(18px)',
};

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: '7px',
  color: '#e4c07b',
  fontSize: '12px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontWeight: 900,
};

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: '16px',
  padding: '13px 14px',
  background: 'rgba(8,0,20,0.68)',
  color: '#fff',
  outline: 'none',
  fontSize: '15px',
};

const errorStyle: CSSProperties = {
  border: '1px solid rgba(255,118,94,0.40)',
  background: 'rgba(255,118,94,0.12)',
  color: '#ffb7a6',
  borderRadius: '16px',
  padding: '12px 14px',
  fontSize: '14px',
  lineHeight: 1.5,
};

const privacyNoteStyle: CSSProperties = {
  marginTop: '22px',
  paddingTop: '18px',
  borderTop: '1px solid rgba(255,255,255,0.10)',
  color: 'rgba(255,255,255,0.52)',
  fontSize: '12px',
  lineHeight: 1.6,
};
