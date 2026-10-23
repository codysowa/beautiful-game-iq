import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './supabase'
import { Capacitor } from '@capacitor/core'

export default function Auth({ passwordRecovery = false }: { passwordRecovery?: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>(passwordRecovery ? 'reset' : 'signin')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    setLoading(true)
    setMessage('')
    setError('')

    if (mode === 'reset') {
      if (password.length < 6) {
        setError('Password must be at least 6 characters.')
        setLoading(false)
        return
      }

      const { error } = await supabase.auth.updateUser({
        password,
      })

      if (error) {
        setError(error.message)
      } else {
        setMessage('Password updated successfully. You can now sign in.')
        setPassword('')
        setMode('signin')
      }

      setLoading(false)
      return
    }

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: displayName.trim(),
          },
        },
      })

      if (error) {
        setError(error.message)
      } else {
        setMessage(
          "Account created. Check your inbox for a confirmation email. If you don't see it, check your spam or junk folder."
        )
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        setError(error.message)
      }
    }

    setLoading(false)
  }

  async function handleForgotPassword() {
    const trimmedEmail = email.trim()

    if (!trimmedEmail) {
      setError('Enter your email address first.')
      return
    }

    setLoading(true)
    setMessage('')
    setError('')

    const redirectTo = Capacitor.isNativePlatform()
      ? 'beautifulgameiq://auth'
      : 'https://beautiful-game-iq.pages.dev/'

    const { error } = await supabase.auth.resetPasswordForEmail(
      trimmedEmail,
      {
        redirectTo,
      }
    )

    if (error) {
      setError(error.message)
    } else {
      setMessage(
        'Password reset email sent. Check your email and follow the link to create a new password.'
      )
    }

    setLoading(false)
  }

  function switchMode(nextMode: 'signin' | 'signup' | 'reset') {
    setMode(nextMode)
    setMessage('')
    setError('')
    setPassword('')
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-emblem" aria-label="Beautiful Game IQ soccer mark">
            <svg viewBox="0 0 512 512" role="img" aria-label="Beautiful Game IQ soccer strategy app icon" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="bgiq-icon-bg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#0b1d2d" />
                  <stop offset="100%" stopColor="#02080e" />
                </linearGradient>
                <linearGradient id="bgiq-icon-green" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#79e65e" />
                  <stop offset="100%" stopColor="#35c94c" />
                </linearGradient>
              </defs>
              <rect width="512" height="512" rx="76" fill="url(#bgiq-icon-bg)" />
              <rect x="1" y="1" width="510" height="510" rx="75" fill="none" stroke="#20384a" strokeWidth="2" />
              <g fill="none" stroke="url(#bgiq-icon-green)" strokeWidth="17" strokeLinecap="round" strokeLinejoin="round">
                <path d="M126 133l24-24m-24 0 24 24" />
                <path d="M354 151l24-24m-24 0 24 24" />
                <path d="M111 207c0-25 9-45 26-61" />
                <path d="M118 151l19-5-2 20" />
                <path d="M326 256h49" />
                <path d="M354 239l21 17-21 17" />
                <circle cx="111" cy="302" r="24" />
                <circle cx="402" cy="258" r="24" />
                <path d="M157 321l17 12m21 13 17 8m22 9 17 3m24 0 17-5m21-10 16-12" strokeDasharray="17 20" />
                <path d="M338 344l20-18-1 24" />
              </g>
              <g transform="translate(256 204)">
                <circle r="99" fill="#07111c" stroke="#f5f7f9" strokeWidth="10" />
                <path d="M0-40 39-13 24 33H-24L-39-13Z" fill="#07111c" stroke="#f5f7f9" strokeWidth="7" strokeLinejoin="round" />
                <path d="M0-40 3-87M39-13 85-31M24 33 55 74M-24 33-60 60M-39-13-82-41M-82-41-68-72M3-87 46-72M85-31 91 15M55 74 15 94M-60 60-84 20M-68-72-35-91M46-72 73-52" fill="none" stroke="#f5f7f9" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              </g>
              <text x="58" y="414" fontSize="112" fontWeight="900" letterSpacing="-7" fontFamily="Arial, Helvetica, sans-serif" fill="#f8fafc">BG</text>
              <text x="254" y="414" fontSize="112" fontWeight="900" letterSpacing="-7" fontFamily="Arial, Helvetica, sans-serif" fill="url(#bgiq-icon-green)">IQ</text>
              <text x="256" y="455" textAnchor="middle" fontSize="19" fontWeight="500" letterSpacing="8" fontFamily="Arial, Helvetica, sans-serif" fill="#f1f5f9">BEAUTIFUL GAME IQ</text>
            </svg>
          </div>
          <div className="auth-status"><span className="auth-status-dot" /> COACH COPILOT <span className="auth-status-divider">·</span> GAME DAY READY</div>
          <div className="auth-kicker">BEAUTIFUL GAME IQ</div>

          <h1>
            {mode === 'reset'
              ? 'Reset Password'
              : mode === 'signup'
                ? 'Create Account'
                : 'Coach Sign In'}
          </h1>

          <p>
            {mode === 'reset'
              ? 'Create a new password for your Beautiful Game IQ account.'
              : 'Your teams, lineups, game tracking, and coaching tools in one place.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'signup' && (
            <label>
              Your Name
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                required
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              disabled={mode === 'reset'}
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                mode === 'reset'
                  ? 'New password'
                  : 'Your password'
              }
              autoComplete={
                mode === 'reset' ? 'new-password' : 'current-password'
              }
              required
              minLength={6}
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading
              ? 'PLEASE WAIT...'
              : mode === 'reset'
                ? 'UPDATE PASSWORD'
                : mode === 'signup'
                  ? 'CREATE ACCOUNT'
                  : 'SIGN IN'}
          </button>
        </form>

        {mode === 'signin' && (
          <button
            type="button"
            className="auth-switch"
            onClick={handleForgotPassword}
            disabled={loading}
          >
            Forgot password?
          </button>
        )}

        {message && <div className="auth-message">{message}</div>}
        {error && <div className="auth-error">{error}</div>}

        {mode !== 'reset' && (
          <button
            type="button"
            className="auth-switch"
            onClick={() =>
              switchMode(mode === 'signin' ? 'signup' : 'signin')
            }
          >
            {mode === 'signin'
              ? 'Need an account? Create one'
              : 'Already have an account? Sign in'}
          </button>
        )}

        {mode === 'reset' && (
          <button
            type="button"
            className="auth-switch"
            onClick={() => switchMode('signin')}
          >
            Back to sign in
          </button>
        )}

        <div style={{ marginTop: '18px', textAlign: 'center', fontSize: '12px', color: '#667085' }}>
          <a href="/privacy.html" target="_blank" rel="noreferrer">Privacy</a>
          <span style={{ margin: '0 8px' }}>•</span>
          <a href="/terms.html" target="_blank" rel="noreferrer">Terms</a>
          <span style={{ margin: '0 8px' }}>•</span>
          <a href="/support.html" target="_blank" rel="noreferrer">Support</a>
        </div>
      </div>
    </div>
  )
}
