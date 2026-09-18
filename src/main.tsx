import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import App from './App'
import Auth from './Auth'
import InviteOnboarding from './InviteOnboarding'
import { supabase } from './supabase'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import type { Session } from '@supabase/supabase-js'

function Root() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    let mounted = true

    let appUrlOpenListener: { remove: () => Promise<void> } | null = null

    if (Capacitor.isNativePlatform()) {
      const listener = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
        try {
          const parsed = new URL(url)
          if (parsed.protocol === 'beautifulgameiq:' || parsed.host === 'auth') {
            const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash
            const params = new URLSearchParams(hash || parsed.search.replace(/^\?/, ''))
            const accessToken = params.get('access_token')
            const refreshToken = params.get('refresh_token')

            if (accessToken && refreshToken) {
              void supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              })
            }
          }
        } catch (error) {
          console.error('Could not process app link:', error)
        }
      })

      void listener.then((handle) => {
        appUrlOpenListener = handle
      })
    }

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
      if (appUrlOpenListener) {
        void appUrlOpenListener.remove()
      }
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
    return <Auth passwordRecovery={passwordRecovery} />
  }

  if (passwordRecovery) {
    return <Auth passwordRecovery={passwordRecovery} />
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