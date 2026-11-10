import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import App from './App'
import AdminAnalytics from './AdminAnalytics'
import './admin.css'
import Auth from './Auth'
import AppInstallGate from './AppInstallGate'
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
              void supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
            }
          }
        } catch (error) {
          console.error('Could not process app link:', error)
        }
      })
      void listener.then((handle) => { appUrlOpenListener = handle })
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      setPasswordRecovery(event === 'PASSWORD_RECOVERY')
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
      if (appUrlOpenListener) void appUrlOpenListener.remove()
    }
  }, [])

  useEffect(() => {
    if (!session?.user.id) return

    const recordActivity = async (activityType: 'app_open' | 'app_resumed') => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !sessionData.session) {
        console.warn('[activity-tracking] No authenticated session; activity was not recorded.', sessionError)
        return
      }

      const { error } = await supabase.rpc('record_user_activity', { p_activity_type: activityType })
      if (error) console.error('[activity-tracking] Could not record activity.', error)
    }

    void recordActivity('app_open')
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void recordActivity('app_resumed')
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    let appStateListener: { remove: () => Promise<void> } | null = null
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void recordActivity('app_resumed')
      }).then((listener) => { appStateListener = listener })
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (appStateListener) void appStateListener.remove()
    }
  }, [session?.user.id])

  if (loading) return <div style={{ padding: '40px' }}>Loading...</div>
  if (passwordRecovery) return <Auth passwordRecovery={passwordRecovery} />
  if (session && !session.user.user_metadata?.display_name) return <InviteOnboarding />

  const isAdminAnalyticsPath = window.location.pathname === '/admin/analytics' || window.location.pathname === '/admin/analytics/'
  const isLoginPath = window.location.pathname === '/login' || window.location.pathname === '/login/'

  if (!Capacitor.isNativePlatform() && !isAdminAnalyticsPath && !isLoginPath) return <AppInstallGate />
  if (!session) return <Auth />
  if (isAdminAnalyticsPath) return <AdminAnalytics />
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><Root /></StrictMode>
)
