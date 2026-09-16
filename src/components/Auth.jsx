// Auth: parent sign-in / sign-up. For grown-ups only — kids never see this
// screen. The app gate (App.jsx) blocks all kid access until a parent
// session exists, verified on launch via GET /api/auth/me.

import React, { useState } from 'react';
import { Screen, BigButton, Title, Subtitle } from './ui.jsx';
import { login, signup, friendlyError } from '../lib/auth.js';

const inputStyle = {
  fontSize: 24,
  padding: '14px 20px',
  borderRadius: 20,
  border: '4px solid #d9d4f5',
  width: '100%',
  maxWidth: 380,
};

export default function Auth({ notice, onAuthed }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const em = email.trim();
    if (!em || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (mode === 'signup' && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      const data = mode === 'login' ? await login(em, password) : await signup(em, password);
      onAuthed(data.parent);
    } catch (err) {
      console.warn('auth failed', err);
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  function switchMode(m) {
    setMode(m);
    setError(null);
  }

  return (
    <Screen>
      <div style={{ fontSize: 64 }}>🔒</div>
      <Title>For grown-ups</Title>
      <Subtitle>
        Sign in to your parent account. It keeps every reader's progress safe
        and synced across devices. Kids never see this screen.
      </Subtitle>

      {notice === 'expired' && (
        <div style={{
          background: '#fff7d6', border: '3px solid #f5b301', borderRadius: 16,
          padding: '12px 20px', fontSize: 19, fontWeight: 700, textAlign: 'center',
        }}>
          Your session expired — please sign in again.
        </div>
      )}
      {notice === 'offline' && (
        <div style={{
          background: '#f1f0fa', border: '3px solid #d9d4f5', borderRadius: 16,
          padding: '12px 20px', fontSize: 19, fontWeight: 700, textAlign: 'center',
        }}>
          You're offline — sign-in needs a connection. Please reconnect and try again.
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        {['login', 'signup'].map((m) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            style={{
              padding: '12px 28px', borderRadius: 20, fontSize: 22, fontWeight: 800,
              cursor: 'pointer',
              border: mode === m ? '4px solid #7c5cd6' : '3px solid #e4e0f7',
              background: mode === m ? '#efe9ff' : '#fff',
              color: mode === m ? '#7c5cd6' : '#5b567d',
            }}
          >
            {m === 'login' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      <form
        onSubmit={submit}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%' }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
          style={inputStyle}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === 'signup' ? 'Choose a password' : 'Password'}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          style={inputStyle}
        />
        {error && (
          <div style={{
            background: '#fdecec', border: '3px solid #e88', borderRadius: 16,
            padding: '12px 20px', fontSize: 19, fontWeight: 700, textAlign: 'center',
            maxWidth: 380,
          }}>
            {error}
          </div>
        )}
        <BigButton small disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in 🔑' : 'Create account ✨'}
        </BigButton>
      </form>

      <div style={{ fontSize: 16, color: '#9a94c7', textAlign: 'center', maxWidth: 420 }}>
        One parent account per family. Progress syncs to your account —
        never to advertisers, never sold.
      </div>
    </Screen>
  );
}
