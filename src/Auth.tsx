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
  const [confirmationPending, setConfirmationPending] = useState(false)

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
      const emailRedirectTo = Capacitor.isNativePlatform()
        ? 'beautifulgameiq://auth'
        : 'https://beautiful-game-iq.pages.dev/'

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo,
          data: {
            display_name: displayName.trim(),
          },
        },
      })

      if (error) {
        setError(error.message)
      } else if (data.session) {
        setConfirmationPending(false)
        setMessage('Your account is ready. You can start coaching.')
      } else {
        setConfirmationPending(true)
        setMessage('Your account details were accepted. Confirm your email to finish setup. If it does not arrive in a few minutes, you can resend it here.')
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

  async function handleResendConfirmation() {
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError('Enter the email address you used to sign up.')
      return
    }

    setLoading(true)
    setMessage('')
    setError('')

    const emailRedirectTo = Capacitor.isNativePlatform()
      ? 'beautifulgameiq://auth'
      : 'https://beautiful-game-iq.pages.dev/'

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: trimmedEmail,
        options: { emailRedirectTo },
      })

      if (error) {
        setError(error.message)
      } else {
        setConfirmationPending(true)
        setMessage('If this address has a pending confirmation, a new email has been requested. Check your inbox; check spam or junk only if it is missing.')
      }
    } catch {
      setError('We could not request a confirmation email right now. Please try again in a moment.')
    } finally {
      setLoading(false)
    }
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
            <img src="/bgiq-app-icon.png" alt="Beautiful Game IQ soccer strategy app icon" />
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
                mode === 'reset' || mode === 'signup' ? 'new-password' : 'current-password'
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

        {message && <div className="auth-message" role="status">{message}</div>}
        {error && <div className="auth-error" role="alert">{error}</div>}

        {mode === 'signup' && confirmationPending && (
          <button
            type="button"
            className="auth-switch"
            onClick={handleResendConfirmation}
            disabled={loading || !email.trim()}
          >
            {loading ? 'PLEASE WAIT...' : 'Resend confirmation email'}
          </button>
        )}

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
