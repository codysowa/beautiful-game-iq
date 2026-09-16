import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import App from './App'
import Auth from './Auth'
import InviteOnboarding from './InviteOnboarding'
import { supabase } from './supabase'
import type { Session } from '@supabase/supabase-js'

function Root() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return

      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return

      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return (
      <div style={{ padding: '40px' }}>
        Loading...
      </div>
    )
  }

  if (!session) {
    return <Auth />
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