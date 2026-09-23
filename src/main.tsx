import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import Marketing from './Marketing'
import App from './App'
import Auth from './Auth'
import InviteOnboarding from './InviteOnboarding'
import { supabase } from './supabase'
import type { Session } from '@supabase/supabase-js'

const WEB_ACCESS_EMAILS = new Set([
  'cody.sowa@outlook.com',
  'claire.grenfell@paramountexport.net',
])

function Root() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [passwordRecovery, setPasswordRecovery] = useState(false)
  const isMarketingPage = window.location.pathname === '/'

  useEffect(() => {
    if (isMarketingPage) {
      setLoading(false)
      return
    }

    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return

      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return

      setSession(nextSession)
      setPasswordRecovery(event === 'PASSWORD_RECOVERY')
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [isMarketingPage])

  if (isMarketingPage) {
    return <Marketing />
  }

  if (loading) {
    return (
      <div style={{ padding: '40px' }}>
        Loading...
      </div>
    )
  }

  if (!session) {
    return <Auth passwordRecovery={passwordRecovery} />
  }

  if (passwordRecovery) {
    return <Auth passwordRecovery={passwordRecovery} />
  }

  const currentEmail = session.user.email?.trim().toLowerCase() ?? ''

  if (!WEB_ACCESS_EMAILS.has(currentEmail)) {
    return (
      <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
        <h1>Web access is limited</h1>
        <p>
          Beautiful Game IQ accounts are created and used through the mobile app.
          Web access is currently limited to authorized team administrators.
        </p>
        <button type="button" onClick={() => supabase.auth.signOut()}>
          Sign Out
        </button>
      </div>
    )
  }

  const displayName = session.user.user_metadata?.display_name

  if (!displayName) {
    return <InviteOnboarding />
  }

  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
)
