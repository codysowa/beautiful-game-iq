import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from './supabase'

export default function InviteOnboarding() {
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.updateUser({
      password,
      data: {
        display_name: displayName.trim(),
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    window.location.reload()
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-kicker">BEAUTIFUL GAME IQ</div>
          <h1>Welcome, Coach</h1>
          <p>
            You’ve been invited to join a team. Set up your profile to get
            started.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Your Name
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Coach name"
              autoComplete="name"
              required
            />
          </label>

          <label>
            Create Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>

          <label>
            Confirm Password
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Enter password again"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </label>

          <button type="submit" disabled={loading}>
            {loading ? 'SETTING UP ACCOUNT...' : 'FINISH ACCOUNT SETUP'}
          </button>
        </form>

        {error && <div className="auth-error">{error}</div>}
      </div>
    </div>
  )
}