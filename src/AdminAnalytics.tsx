import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

type AnalyticsPayload = {
  generated_at: string
  metrics: Record<string, number>
  recent_teams: Array<{ name: string; age_group: string | null; format: string; created_at: string }>
  recent_games: Array<{ opponent: string; game_date: string; status: string; created_at: string }>
}

const metricLabels: Array<[string, string]> = [
  ['accounts', 'Accounts'],
  ['teams', 'Teams created'],
  ['games', 'Games created'],
  ['game_events', 'Game events recorded'],
  ['accounts_7d', 'New accounts · 7 days'],
  ['accounts_30d', 'New accounts · 30 days'],
  ['teams_7d', 'Teams created · 7 days'],
  ['teams_30d', 'Teams created · 30 days'],
  ['games_7d', 'Games created · 7 days'],
  ['games_30d', 'Games created · 30 days'],
]

function dateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default function AdminAnalytics() {
  const [data, setData] = useState<AnalyticsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data: payload, error: requestError } = await supabase.rpc('get_admin_analytics')
    if (requestError) {
      setError(requestError.code === '42501' || requestError.message.toLowerCase().includes('not authorized')
        ? 'This account is not authorized to view the admin dashboard.'
        : 'Could not load analytics. Check that the admin analytics database migration has been applied.')
      setData(null)
    } else {
      setData(payload as AnalyticsPayload)
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function signOut() {
    await supabase.auth.signOut()
    window.location.assign('/')
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">BEAUTIFUL GAME IQ · INTERNAL</p>
          <h1>Product analytics</h1>
          <p className="admin-subtitle">A private view of product adoption and recorded coaching activity.</p>
        </div>
        <div className="admin-actions">
          <button onClick={() => void load()} disabled={loading}>Refresh</button>
          <button className="admin-secondary" onClick={() => void signOut()}>Sign out</button>
        </div>
      </header>

      {loading && <section className="admin-panel">Loading analytics…</section>}
      {error && <section className="admin-panel admin-error"><h2>Dashboard unavailable</h2><p>{error}</p></section>}

      {data && <>
        <p className="admin-updated">Updated {dateTime(data.generated_at)}</p>
        <section className="admin-metrics" aria-label="Product metrics">
          {metricLabels.map(([key, label]) => (
            <article className="admin-metric" key={key}>
              <span>{label}</span>
              <strong>{(data.metrics[key] ?? 0).toLocaleString()}</strong>
            </article>
          ))}
        </section>

        <section className="admin-columns">
          <article className="admin-panel">
            <div className="admin-section-title"><h2>Recently created teams</h2><span>{data.recent_teams.length}</span></div>
            {data.recent_teams.length === 0 ? <p className="admin-empty">No teams yet.</p> :
              <div className="admin-list">{data.recent_teams.map((team, index) => (
                <div className="admin-list-row" key={team.name + team.created_at + index}>
                  <div><strong>{team.name}</strong><span>{[team.age_group, team.format].filter(Boolean).join(' · ')}</span></div>
                  <time>{dateTime(team.created_at)}</time>
                </div>
              ))}</div>}
          </article>

          <article className="admin-panel">
            <div className="admin-section-title"><h2>Recently created games</h2><span>{data.recent_games.length}</span></div>
            {data.recent_games.length === 0 ? <p className="admin-empty">No games yet.</p> :
              <div className="admin-list">{data.recent_games.map((game, index) => (
                <div className="admin-list-row" key={game.opponent + game.created_at + index}>
                  <div><strong>vs. {game.opponent}</strong><span>{game.game_date} · {game.status}</span></div>
                  <time>{dateTime(game.created_at)}</time>
                </div>
              ))}</div>}
          </article>
        </section>

        <p className="admin-note">
          Important: this first version reports records already stored in Supabase. It does not yet measure app opens,
          unique active coaches, sessions, or individual feature usage. Account counts can include testing and review accounts.
        </p>
      </>}
    </main>
  )
}
