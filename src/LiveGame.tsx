import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import {
  getRotationAdvice,
  optimizationFormations,
  getDefaultFormationForFormat,
  getFormationsForFormat,
  formationRows,
  type AttendanceRecord,
  type GameSituation,
  type RotationAdvice,
  type TeamRules,
} from './optimizer'

type Player = {
  id: string
  name: string
  jersey_number: number | null
  usage_priority: 'Core' | 'Regular' | 'Development' | 'Situational' | 'Limited' | null
  bench_tolerance: 'Minimal' | 'Normal' | 'Flexible' | null
  position_preferences: Record<string, number> | null
  avoid_positions: string[] | null
  coach_notes: string | null
}

type Lineup = {
  player_id: string
  quarter: number
  position: string
}

type Event = {
  id: string
  quarter: number
  event_type: string
  player_id: string | null
  assister_id: string | null
  created_at: string
}

type Props = {
  gameId: string
  opponent: string
  players: Player[]
  lineups: Lineup[]
  captainIds: string[]
  onBack: () => void
  userRole: 'owner' | 'coach' | 'viewer'
}

const positionOrder = [
  'Goalkeeper',
  'Left Defense',
  'Left Center Defense',
  'Center Defense',
  'Right Center Defense',
  'Right Defense',
  'Left Mid',
  'Center Mid',
  'Right Mid',
  'Left Striker',
  'Center Striker',
  'Right Striker',
  'Left Forward',
  'Center Forward',
  'Right Forward',
]

const positionShort: Record<string, string> = {
  Goalkeeper: 'GK',
  'Left Defense': 'LD',
  'Left Center Defense': 'LCD',
  'Center Defense': 'CD',
  'Right Center Defense': 'RCD',
  'Right Defense': 'RD',
  'Left Mid': 'LM',
  'Center Mid': 'CM',
  'Right Mid': 'RM',
  'Left Striker': 'LS',
  'Center Striker': 'CS',
  'Right Striker': 'RS',
  'Left Forward': 'LF',
  'Center Forward': 'CF',
  'Right Forward': 'RF',
}

export default function LiveGame({
  gameId,
  opponent,
  players,
  lineups,
  captainIds,
  onBack,
  userRole,
}: Props) {
  const canManageGame = userRole === 'owner' || userRole === 'coach'
  const canStatTrack = userRole === 'owner' || userRole === 'coach' || userRole === 'viewer'
  const [quarter, setQuarter] = useState(1)
  const [events, setEvents] = useState<Event[]>([])
  const [showGoal, setShowGoal] = useState(false)
  const [goalScorer, setGoalScorer] = useState('')
  const [goalAssister, setGoalAssister] = useState('')
  const [saving, setSaving] = useState(false)
  const [gameStatus, setGameStatus] = useState('Scheduled')
  const [gameFormat, setGameFormat] = useState('7v7')
  const [liveLineup, setLiveLineup] = useState<Lineup[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const [subOutPlayerId, setSubOutPlayerId] = useState('')
  const [subInPlayerId, setSubInPlayerId] = useState('')
  const [liveFormation, setLiveFormation] = useState('3-1-2')
  const [lineupLoading, setLineupLoading] = useState(true)
  const [teamRules, setTeamRules] = useState<TeamRules>(null)
  const [attendance, setAttendance] = useState<Record<string, AttendanceRecord>>({})
  const [actualLiveLineups, setActualLiveLineups] = useState<Lineup[]>([])
  const [optimizerLoading, setOptimizerLoading] = useState(true)
  const [showNextQuarterOptimizer, setShowNextQuarterOptimizer] = useState(false)
  const [nextQuarterSituation, setNextQuarterSituation] = useState<GameSituation>('Normal')
  const [nextQuarterFormation, setNextQuarterFormation] = useState('3-1-2')
  const [nextQuarterAdvice, setNextQuarterAdvice] = useState<RotationAdvice | null>(null)
  const [showCurrentQuarterOptimizer, setShowCurrentQuarterOptimizer] = useState(false)
  const [currentQuarterSituation, setCurrentQuarterSituation] = useState<GameSituation>('Normal')
  const [currentQuarterFormation, setCurrentQuarterFormation] = useState('3-1-2')
  const [currentQuarterAdvice, setCurrentQuarterAdvice] = useState<RotationAdvice | null>(null)
  const lineupLoadId = useRef(0)

  function formationForLineup(items: Lineup[]) {
    const match = getFormationsForFormat(gameFormat).find((formation) => {
      const slots = optimizationFormations[formation] || []
      const positions = new Set(items.map((item) => item.position))
      return slots.length === items.length && slots.every((slot) => positions.has(slot))
    })
    return match || getDefaultFormationForFormat(gameFormat)
  }

  async function loadGame() {
    const { data } = await supabase
      .from('games')
      .select('status, format')
      .eq('id', gameId)
      .single()

    if (data) {
      setGameStatus(data.status)
      const format = data.format || '7v7'
      setGameFormat(format)
      const defaultFormation = getDefaultFormationForFormat(format)
      setLiveFormation(defaultFormation)
      setNextQuarterFormation(defaultFormation)
      setCurrentQuarterFormation(defaultFormation)
    }
  }

  async function loadEvents() {
    const { data, error } = await supabase
      .from('game_events')
      .select('*')
      .eq('game_id', gameId)
      .order('created_at', { ascending: false })

    if (!error && data) setEvents(data)
  }

  async function loadOptimizerContext() {
    setOptimizerLoading(true)
    setTeamRules(null)
    setAttendance({})
    setActualLiveLineups([])
    const [{ data: gameData }, { data: attendanceData }, { data: actualData }] = await Promise.all([
      supabase.from('games').select('team_id').eq('id', gameId).single(),
      supabase.from('game_attendance').select('player_id, status, arrival_quarter').eq('game_id', gameId),
      supabase.from('game_live_lineups').select('player_id, quarter, position').eq('game_id', gameId),
    ])

    if (gameData?.team_id) {
      const { data: teamData } = await supabase
        .from('teams')
        .select('max_gk_quarters, max_bench_quarters, min_quarters_played, target_quarters_played, require_everyone_play')
        .eq('id', gameData.team_id)
        .single()
      setTeamRules(teamData || null)
    }

    const attendanceMap: Record<string, AttendanceRecord> = {}
    for (const row of attendanceData || []) {
      attendanceMap[row.player_id] = { status: row.status, arrival_quarter: row.arrival_quarter }
    }
    setAttendance(attendanceMap)
    setActualLiveLineups((actualData || []) as Lineup[])
    setOptimizerLoading(false)
  }

  async function loadLiveLineup(targetQuarter: number) {
    const requestId = ++lineupLoadId.current
    setLineupLoading(true)
    setLiveLineup([])

    const { data, error } = await supabase
      .from('game_live_lineups')
      .select('player_id, quarter, position')
      .eq('game_id', gameId)
      .eq('quarter', targetQuarter)
      .order('created_at', { ascending: true })

    if (requestId !== lineupLoadId.current) return

    if (!error && data && data.length > 0) {
      const actual = data as Lineup[]
      setLiveLineup(actual)
      setLiveFormation(formationForLineup(actual))
      setLineupLoading(false)
      return
    }

    const planned = lineups.filter((item) => item.quarter === targetQuarter)
    setLiveLineup(planned)
    setLiveFormation(formationForLineup(planned))
    setLineupLoading(false)
  }

  async function persistLiveLineup(nextLineup: Lineup[], targetQuarter = quarter) {
    const { error: deleteError } = await supabase
      .from('game_live_lineups')
      .delete()
      .eq('game_id', gameId)
      .eq('quarter', targetQuarter)

    if (deleteError) {
      alert(`Could not save live lineup: ${deleteError.message}`)
      return false
    }

    if (nextLineup.length === 0) {
      setActualLiveLineups((current) => current.filter((item) => item.quarter !== targetQuarter))
      return true
    }

    const rows = nextLineup.map((item) => ({
      game_id: gameId,
      quarter: targetQuarter,
      player_id: item.player_id,
      position: item.position,
    }))

    const { error: insertError } = await supabase
      .from('game_live_lineups')
      .insert(rows)

    if (insertError) {
      alert(`Could not save live lineup: ${insertError.message}`)
      return false
    }

    setActualLiveLineups((current) => [
      ...current.filter((item) => item.quarter !== targetQuarter),
      ...nextLineup.map((item) => ({ ...item, quarter: targetQuarter })),
    ])
    return true
  }

  useEffect(() => {
    loadGame()
    loadEvents()
    loadOptimizerContext()
  }, [gameId])

  useEffect(() => {
    loadLiveLineup(quarter)
    setSelectedPlayerId('')
    setSubOutPlayerId('')
    setSubInPlayerId('')
  }, [lineups, quarter, gameId, gameFormat])

  async function updateGameStatus(status: string) {
    if (!canManageGame) return
    setSaving(true)
    const { error } = await supabase
      .from('games')
      .update({ status })
      .eq('id', gameId)

    if (!error) setGameStatus(status)
    else alert('Could not update game status.')
    setSaving(false)
  }

  const ourGoals = events.filter((event) => event.event_type === 'our_goal').length
  const theirGoals = events.filter((event) => event.event_type === 'their_goal').length

  const currentLineup = useMemo(
    () => lineups.filter((item) => item.quarter === quarter),
    [lineups, quarter]
  )

  const activeLineup = lineupLoading ? [] : (liveLineup.length > 0 ? liveLineup : currentLineup)

  const currentPlayers = activeLineup
    .map((item) => {
      const player = players.find((p) => p.id === item.player_id)
      return player ? { ...player, position: item.position } : null
    })
    .filter(Boolean) as (Player & { position: string })[]

  const benchPlayers = players.filter(
    (player) => !activeLineup.some((item) => item.player_id === player.id)
  )

  const selectedPlayer = currentPlayers.find((player) => player.id === selectedPlayerId)
  const subOutPlayer = currentPlayers.find((player) => player.id === subOutPlayerId)
  const subInPlayer: Player | undefined = benchPlayers.find((player) => player.id === subInPlayerId)

  const playerStats = players
    .map((player) => {
      const goals = events.filter(
        (event) => event.event_type === 'our_goal' && event.player_id === player.id
      ).length
      const assists = events.filter(
        (event) => event.event_type === 'our_goal' && event.assister_id === player.id
      ).length
      return { ...player, goals, assists }
    })
    .filter((player) => player.goals > 0 || player.assists > 0)

  const formationSituationWarning =
    nextQuarterSituation === 'Pull Back / AYSO Mode' && nextQuarterFormation !== '4-1-1'
  const currentFormationSituationWarning =
    currentQuarterSituation === 'Pull Back / AYSO Mode' && currentQuarterFormation !== '4-1-1'

  function playerName(id: string | null) {
    if (!id) return '-'
    const player = players.find((p) => p.id === id)
    return player ? `#${player.jersey_number ?? ''} ${player.name}` : '-'
  }

  function movePlayerToPosition(playerId: string, position: string) {
    if (!canManageGame) return
    const source = activeLineup.find((item) => item.player_id === playerId)
    if (!source) return

    const occupant = activeLineup.find(
      (item) => item.position === position && item.player_id !== playerId
    )

    const nextLineup = activeLineup.map((item) => {
      if (item.player_id === playerId) {
        return { ...item, position }
      }
      if (occupant && item.player_id === occupant.player_id) {
        return { ...item, position: source.position }
      }
      return item
    })

    setLiveLineup(nextLineup)
    void persistLiveLineup(nextLineup)
    setSelectedPlayerId('')
  }

  function substituteIn(playerId: string) {
    if (!canManageGame) return
    if (!playerId || !subOutPlayerId) return

    const outgoing = activeLineup.find((item) => item.player_id === subOutPlayerId)
    if (!outgoing) return

    const nextLineup = [
      ...activeLineup.filter((item) => item.player_id !== subOutPlayerId),
      {
        quarter,
        player_id: playerId,
        position: outgoing.position,
      },
    ]

    setLiveLineup(nextLineup)
    void persistLiveLineup(nextLineup)
    setSubOutPlayerId('')
    setSubInPlayerId('')
  }

  function changeFormation(newFormation: string) {
    if (!canManageGame) return
    const slots = optimizationFormations[newFormation]
    if (!slots || activeLineup.length === 0) return

    const goalkeeper = activeLineup.find((item) => item.position === 'Goalkeeper')
    const usedPlayers = new Set<string>()
    const usedPositions = new Set<string>()
    const next: Lineup[] = []

    if (goalkeeper && slots.includes('Goalkeeper')) {
      next.push({ ...goalkeeper, position: 'Goalkeeper' })
      usedPlayers.add(goalkeeper.player_id)
      usedPositions.add('Goalkeeper')
    }

    const remainingPlayers = activeLineup
      .filter((item) => !usedPlayers.has(item.player_id))
      .sort((a, b) => positionOrder.indexOf(a.position) - positionOrder.indexOf(b.position))

    for (const slot of slots) {
      if (slot === 'Goalkeeper' || usedPositions.has(slot)) continue

      const samePosition = remainingPlayers.find(
        (item) => item.position === slot && !usedPlayers.has(item.player_id)
      )
      const player = samePosition || remainingPlayers.find(
        (item) => !usedPlayers.has(item.player_id)
      )

      if (!player) continue

      next.push({ ...player, position: slot })
      usedPlayers.add(player.player_id)
      usedPositions.add(slot)
    }

    setLiveLineup(next)
    void persistLiveLineup(next)
    setLiveFormation(newFormation)
    setSelectedPlayerId('')
    setSubOutPlayerId('')
    setSubInPlayerId('')
  }

  async function recordTheirGoal() {
    if (!canStatTrack || gameStatus !== 'Live') return
    setSaving(true)
    const { data, error } = await supabase
      .from('game_events')
      .insert({ game_id: gameId, quarter, event_type: 'their_goal' })
      .select()
      .single()

    if (!error && data) setEvents((current) => [data, ...current])
    setSaving(false)
  }

  async function recordOurGoal() {
    if (!canStatTrack || !goalScorer || gameStatus !== 'Live') return
    setSaving(true)
    const { data, error } = await supabase
      .from('game_events')
      .insert({
        game_id: gameId,
        quarter,
        event_type: 'our_goal',
        player_id: goalScorer,
        assister_id: goalAssister || null,
      })
      .select()
      .single()

    if (!error && data) setEvents((current) => [data, ...current])
    setGoalScorer('')
    setGoalAssister('')
    setShowGoal(false)
    setSaving(false)
  }

  async function deleteEvent(eventId: string) {
    if (!confirm('Delete this event?')) return
    setSaving(true)
    const { error } = await supabase.from('game_events').delete().eq('id', eventId)
    if (!error) {
      setEvents((current) => current.filter((event) => event.id !== eventId))
    } else {
      alert('Could not delete event.')
    }
    setSaving(false)
  }

  function openCurrentQuarterOptimizer() {
    setCurrentQuarterSituation('Normal')
    setCurrentQuarterFormation(getFormationsForFormat(gameFormat).includes(liveFormation) ? liveFormation : getDefaultFormationForFormat(gameFormat))
    setCurrentQuarterAdvice(null)
    setShowCurrentQuarterOptimizer(true)
  }

  function optimizeCurrentQuarter() {
    const recentGoalScorerIds = [...new Set(
      events
        .filter((event) => event.event_type === 'our_goal' && event.player_id)
        .map((event) => event.player_id as string)
    )]
    setCurrentQuarterAdvice(getRotationAdvice({
      players,
      teamRules,
      attendance,
      plannedLineups: lineups,
      priorActualLiveLineups: actualLiveLineups,
      gameSituation: currentQuarterSituation,
      formation: currentQuarterFormation,
      quarter,
      currentScore: { ours: ourGoals, theirs: theirGoals },
      recentGoalScorerIds,
    }))
  }

  async function applyCurrentQuarterPlan() {
    if (!canManageGame) return
    if (!currentQuarterAdvice) return
    const currentLineup = currentQuarterAdvice.suggestedLineup.map(({ player, position }) => ({
      player_id: player.id,
      quarter,
      position,
    }))
    setSaving(true)
    const saved = await persistLiveLineup(currentLineup, quarter)
    setSaving(false)
    if (!saved) return
    setLiveLineup(currentLineup)
    setLiveFormation(currentQuarterFormation)
    setShowCurrentQuarterOptimizer(false)
    setCurrentQuarterAdvice(null)
  }

  function openNextQuarterOptimizer() {
    if (quarter >= 4) return
    setNextQuarterSituation('Normal')
    setNextQuarterFormation(getFormationsForFormat(gameFormat).includes(liveFormation) ? liveFormation : getDefaultFormationForFormat(gameFormat))
    setNextQuarterAdvice(null)
    setShowNextQuarterOptimizer(true)
  }

  function optimizeNextQuarter() {
    if (quarter >= 4) return
    const recentGoalScorerIds = [...new Set(
      events
        .filter((event) => event.event_type === 'our_goal' && event.player_id)
        .map((event) => event.player_id as string)
    )]
    setNextQuarterAdvice(getRotationAdvice({
      players,
      teamRules,
      attendance,
      plannedLineups: lineups,
      priorActualLiveLineups: actualLiveLineups,
      gameSituation: nextQuarterSituation,
      formation: nextQuarterFormation,
      quarter: quarter + 1,
      currentScore: { ours: ourGoals, theirs: theirGoals },
      recentGoalScorerIds,
    }))
  }

  async function applyNextQuarterPlan() {
    if (!nextQuarterAdvice || quarter >= 4) return
    const targetQuarter = quarter + 1
    const nextLineup = nextQuarterAdvice.suggestedLineup.map(({ player, position }) => ({
      player_id: player.id,
      quarter: targetQuarter,
      position,
    }))

    setSaving(true)
    const saved = await persistLiveLineup(nextLineup, targetQuarter)
    setSaving(false)
    if (!saved) return

    setShowNextQuarterOptimizer(false)
    setNextQuarterAdvice(null)
  }

  function fieldRows() {
    const rows = formationRows[liveFormation] || formationRows[getDefaultFormationForFormat(gameFormat)]
    return rows.filter((row) =>
      row.some((position) => activeLineup.some((item) => item.position === position))
    )
  }

  function fieldPlayer(position: string) {
    const item = activeLineup.find((entry) => entry.position === position)
    if (!item) return null
    const player = players.find((entry) => entry.id === item.player_id)
    if (!player) return null

    return (
      <button
        key={`${position}-${player.id}`}
        onClick={() => canManageGame && gameStatus === 'Live' && setSelectedPlayerId(player.id)}
        disabled={!canManageGame || gameStatus !== 'Live'}
        style={{
          width: '100%',
          minHeight: 62,
          padding: 6,
          border: '1px solid #b8c2cc',
          borderRadius: 8,
          background: 'white',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 'bold', opacity: 0.7 }}>
          {positionShort[position] || position}
        </div>
        <div style={{ fontWeight: 'bold', fontSize: 14 }}>
          #{player.jersey_number ?? '-'} {player.name}
        </div>
      </button>
    )
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 10, paddingBottom: 90 }}>
      <button onClick={onBack} style={{ padding: '8px 12px', marginBottom: 6, minHeight: 42 }}>
        Back
      </button>

      <div style={{ textAlign: 'center', padding: '4px 0 10px' }}>
        <div style={{ fontSize: 14, opacity: 0.7 }}>{gameStatus.toUpperCase()}</div>
        <h1 style={{ margin: '2px 0', fontSize: 21 }}>vs {opponent}</h1>
        <div style={{ fontSize: 48, fontWeight: 'bold', lineHeight: 1, marginTop: 6 }}>
          {ourGoals} - {theirGoals}
        </div>
        {captainIds.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <strong>Captains:</strong> {captainIds.map((id) => playerName(id)).join('  |  ')}
          </div>
        )}
      </div>

      {canManageGame && gameStatus === 'Scheduled' && (
        <button
          onClick={() => updateGameStatus('Live')}
          disabled={saving}
          style={{ width: '100%', minHeight: 64, fontSize: 21, fontWeight: 'bold', marginBottom: 8 }}
        >
          START GAME
        </button>
      )}

      {canManageGame && gameStatus === 'Live' && (
        <button
          onClick={() => {
            if (confirm('End this game? No more live events will be recorded.')) {
              updateGameStatus('Completed')
            }
          }}
          disabled={saving}
          style={{ width: '100%', minHeight: 52, fontSize: 17, fontWeight: 'bold', marginBottom: 8 }}
        >
          END GAME
        </button>
      )}

      {canManageGame && gameStatus === 'Completed' && (
        <button
          onClick={() => updateGameStatus('Live')}
          disabled={saving}
          style={{ width: '100%', minHeight: 52, fontSize: 17, fontWeight: 'bold', marginBottom: 8 }}
        >
          REOPEN GAME
        </button>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5, marginBottom: 8 }}>
        {[1, 2, 3, 4].map((q) => (
          <button
            key={q}
            onClick={() => setQuarter(q)}
            disabled={lineupLoading}
            style={{ padding: '13px 4px', fontWeight: quarter === q ? 'bold' : 'normal', fontSize: 16, minHeight: 48 }}
          >
            Q{q}
          </button>
        ))}
      </div>

      {canManageGame && gameStatus === 'Live' && (
        <button
          onClick={openCurrentQuarterOptimizer}
          disabled={lineupLoading || optimizerLoading}
          style={{ width: '100%', minHeight: 52, fontSize: 15, fontWeight: 'bold', marginBottom: 8 }}
        >
          {optimizerLoading ? 'PREPARING...' : `OPTIMIZE Q${quarter} NOW`}
        </button>
      )}

      {canManageGame && gameStatus === 'Live' && quarter < 4 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 8 }}>
          <button
            onClick={openNextQuarterOptimizer}
            disabled={lineupLoading || optimizerLoading}
            style={{ minHeight: 52, fontSize: 15, fontWeight: 'bold' }}
          >
            {optimizerLoading ? 'PREPARING...' : `OPTIMIZE Q${quarter + 1}`}
          </button>
          <button
            onClick={() => setQuarter(quarter + 1)}
            disabled={lineupLoading}
            style={{ minHeight: 52, fontSize: 18, fontWeight: 'bold' }}
          >
            {lineupLoading ? 'LOADING...' : `START Q${quarter + 1}`}
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
        <button
          onClick={() => setShowGoal(true)}
          disabled={gameStatus !== 'Live' || saving}
          style={{ minHeight: 76, fontSize: 18, fontWeight: 'bold' }}
        >
          OUR GOAL
        </button>
        <button
          onClick={recordTheirGoal}
          disabled={gameStatus !== 'Live' || saving}
          style={{ minHeight: 76, fontSize: 18, fontWeight: 'bold' }}
        >
          THEIR GOAL
        </button>
      </div>

      <section style={{ marginTop: 10, border: '1px solid #ddd', borderRadius: 10, padding: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>Q{quarter} Formation</h2>
          {canManageGame && gameStatus === 'Live' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, opacity: 0.65 }}>Formation</span>
              <select
                value={liveFormation}
                onChange={(e) => changeFormation(e.target.value)}
                style={{ padding: '6px 8px', fontWeight: 'bold' }}
              >
                {getFormationsForFormat(gameFormat).map((formation) => (
                  <option key={formation} value={formation}>{formation}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {lineupLoading ? (
          <p style={{ margin: 0, fontWeight: 'bold' }}>Loading Q{quarter} lineup...</p>
        ) : activeLineup.length === 0 ? (
          <p style={{ margin: 0 }}>No saved lineup for this quarter.</p>
        ) : (
          <>
            <div
              style={{
                background: '#dfe9df',
                border: '2px solid #8a9b8a',
                borderRadius: 10,
                padding: '14px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                minHeight: 300,
                boxSizing: 'border-box',
              }}
            >
              {fieldRows().map((row, rowIndex) => (
                <div
                  key={`row-${rowIndex}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${Math.min(row.length, 3)}, 1fr)`,
                    gap: 6,
                    alignItems: 'center',
                    flex: rowIndex === fieldRows().length - 1 ? 0 : 1,
                  }}
                >
                  {row.map((position) => fieldPlayer(position))}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
              Planned lineup stays unchanged. Live changes are saved to this game's actual lineup.
            </div>

            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #ddd' }}>
              <strong>Bench</strong>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 5,
                  marginTop: 6,
                }}
              >
                {benchPlayers.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => canManageGame && gameStatus === 'Live' && setSubInPlayerId(player.id)}
                    disabled={!canManageGame || gameStatus !== 'Live'}
                    style={{
                      padding: 9,
                      textAlign: 'left',
                      minHeight: 58,
                      border: '1px dashed #aaa',
                      borderRadius: 8,
                      background: 'white',
                    }}
                  >
                    <strong>#{player.jersey_number ?? '-'} {player.name}</strong>
                    {gameStatus === 'Live' && <div style={{ fontSize: 11, marginTop: 3, opacity: 0.65 }}>Tap for sub</div>}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      {canManageGame && selectedPlayer && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', width: '100%', maxWidth: 700, padding: 18, borderRadius: '14px 14px 0 0', boxSizing: 'border-box' }}>
            <h2 style={{ marginTop: 0 }}>Move {selectedPlayer.name}</h2>
            <div style={{ marginBottom: 12, opacity: 0.7 }}>
              Current position: {selectedPlayer.position}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {activeLineup
                .map((item) => item.position)
                .sort((a, b) => positionOrder.indexOf(a) - positionOrder.indexOf(b))
                .map((position) => (
                  <button
                    key={position}
                    onClick={() => movePlayerToPosition(selectedPlayer.id, position)}
                    disabled={position === selectedPlayer.position}
                    style={{ padding: 12 }}
                  >
                    {positionShort[position] || position}
                    <div style={{ fontSize: 11, marginTop: 3, opacity: 0.65 }}>{position}</div>
                  </button>
                ))}
            </div>
            <button
              onClick={() => { setSelectedPlayerId(''); setSubOutPlayerId(selectedPlayer.id) }}
              disabled={gameStatus !== 'Live'}
              style={{ width: '100%', marginTop: 10, padding: 13, fontWeight: 'bold' }}
            >
              Sub Out {selectedPlayer.name}
            </button>
            <button onClick={() => setSelectedPlayerId('')} style={{ width: '100%', marginTop: 8, padding: 12 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {canManageGame && (subOutPlayerId || subInPlayerId) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', width: '100%', maxWidth: 700, padding: 18, borderRadius: '14px 14px 0 0', boxSizing: 'border-box' }}>
            {subOutPlayerId && !subInPlayerId ? (
              <>
                <h2 style={{ marginTop: 0 }}>Sub Out {subOutPlayer?.name ?? ''}</h2>
                <div style={{ marginBottom: 12 }}>Select the player coming in.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {benchPlayers.map((player) => (
                    <button
                      key={player.id}
                      onClick={() => setSubInPlayerId(player.id)}
                      style={{ padding: 10, minHeight: 58 }}
                    >
                      <strong>#{player.jersey_number ?? '-'} {player.name}</strong>
                    </button>
                  ))}
                </div>
              </>
            ) : subInPlayerId && !subOutPlayerId ? (
              <>
                <h2 style={{ marginTop: 0 }}>Sub In {subInPlayer?.name ?? ''}</h2>
                <div style={{ marginBottom: 12 }}>Select the player coming off.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {currentPlayers.map((player) => (
                    <button
                      key={player.id}
                      onClick={() => setSubOutPlayerId(player.id)}
                      style={{ padding: 10, minHeight: 58 }}
                    >
                      <strong>#{player.jersey_number ?? '-'} {player.name}</strong>
                      <div style={{ fontSize: 11, marginTop: 3, opacity: 0.65 }}>{positionShort[player.position] || player.position}</div>
                    </button>
                  ))}
                </div>
              </>
            ) : subOutPlayerId && subInPlayerId ? (
              <>
                <h2 style={{ marginTop: 0 }}>Substitute</h2>
                <div style={{ marginBottom: 12 }}>
                  <strong>{subOutPlayer?.name}</strong> comes out of {subOutPlayer?.position}.
                </div>
                <button
                  onClick={() => substituteIn(subInPlayerId)}
                  disabled={!subInPlayer}
                  style={{ width: '100%', padding: 14, fontWeight: 'bold' }}
                >
                  Sub in #{subInPlayer?.jersey_number ?? '-'} {subInPlayer?.name ?? ''}
                </button>
              </>
            ) : null}
            <button
              onClick={() => { setSubOutPlayerId(''); setSubInPlayerId('') }}
              style={{ width: '100%', marginTop: 12, padding: 12 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {gameStatus === 'Live' && !showGoal && !selectedPlayer && !subInPlayerId && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 900,
            background: 'white',
            borderTop: '1px solid #ccc',
            padding: '7px 10px',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ maxWidth: 560, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 6 }}>
            <button onClick={() => setShowGoal(true)} disabled={saving || lineupLoading} style={{ minHeight: 50, fontWeight: 'bold' }}>
              + OUR GOAL
            </button>
            <button onClick={recordTheirGoal} disabled={saving || lineupLoading} style={{ minHeight: 50, fontWeight: 'bold' }}>
              + THEIR GOAL
            </button>
            {quarter < 4 ? (
              <button onClick={() => setQuarter(quarter + 1)} disabled={lineupLoading} style={{ minHeight: 50, fontWeight: 'bold' }}>
                Q{quarter + 1} -&gt;
              </button>
            ) : (
              canManageGame ? (
                <button onClick={() => updateGameStatus('Completed')} disabled={saving} style={{ minHeight: 50, fontWeight: 'bold' }}>
                  END GAME
                </button>
              ) : (
                <button onClick={() => setQuarter(1)} disabled={lineupLoading} style={{ minHeight: 50, fontWeight: 'bold' }}>Q1</button>
              )
            )}
          </div>
        </div>
      )}

      {playerStats.length > 0 && (
        <section style={{ marginTop: 10, border: '1px solid #ddd', borderRadius: 10, padding: 10 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Game Stats</h2>
          {playerStats.map((player) => (
            <div key={player.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #eee' }}>
              <strong>#{player.jersey_number ?? '-'} {player.name}</strong>
              <span>
                {player.goals > 0 && `${player.goals} G`}
                {player.goals > 0 && player.assists > 0 && '  '}
                {player.assists > 0 && `${player.assists} A`}
              </span>
            </div>
          ))}
        </section>
      )}

      <section style={{ marginTop: 10, border: '1px solid #ddd', borderRadius: 10, padding: 10 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>Recent Events</h2>
        {events.length === 0 ? (
          <p style={{ margin: 0 }}>No events yet.</p>
        ) : (
          events.slice(0, 10).map((event) => (
            <div key={event.id} style={{ padding: '9px 0', borderBottom: '1px solid #eee' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{event.event_type === 'our_goal' ? 'OUR GOAL' : 'THEIR GOAL'}</strong>
                <button onClick={() => deleteEvent(event.id)} disabled={saving} style={{ padding: '4px 8px', fontSize: 12 }}>
                  Delete
                </button>
              </div>
              {event.event_type === 'our_goal' && (
                <div style={{ marginTop: 3 }}>
                  {playerName(event.player_id)}
                  {event.assister_id && <span> - Assist: {playerName(event.assister_id)}</span>}
                </div>
              )}
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>Q{event.quarter}</div>
            </div>
          ))
        )}
      </section>

      {canManageGame && showNextQuarterOptimizer && quarter < 4 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: 'white', width: '100%', maxWidth: 700, maxHeight: '88vh', overflowY: 'auto', padding: 16, borderRadius: '14px 14px 0 0', boxSizing: 'border-box' }}>
            <h2 style={{ margin: '0 0 4px' }}>Optimize Q{quarter + 1}</h2>
            <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 12 }}>
              Score: {ourGoals}-{theirGoals}. Uses actual live assignments from earlier quarters when available.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                Game Situation
                <select value={nextQuarterSituation} onChange={(e) => { setNextQuarterSituation(e.target.value as GameSituation); setNextQuarterAdvice(null) }} style={{ padding: 10 }}>
                  <option>Normal</option>
                  <option>Protect Lead</option>
                  <option>Need Goal</option>
                  <option>Development</option>
                  <option>Pull Back / AYSO Mode</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                Formation
                <select value={nextQuarterFormation} onChange={(e) => { setNextQuarterFormation(e.target.value); setNextQuarterAdvice(null) }} style={{ padding: 10 }}>
                  {getFormationsForFormat(gameFormat).map((formation) => <option key={formation}>{formation}</option>)}
                </select>
              </label>
            </div>

            {formationSituationWarning && (
              <div
                style={{
                  marginTop: 10,
                  padding: 12,
                  border: '1px solid #d6a84f',
                  borderRadius: 8,
                  background: '#fff7e6',
                  fontSize: 13,
                }}
              >
                <strong>Pull Back Suggestion</strong>
                <div style={{ marginTop: 4 }}>
                  You're protecting a comfortable lead. Consider switching to a more defensive formation before applying this plan.
                </div>
              </div>
            )}

            {!nextQuarterAdvice ? (
              <button onClick={optimizeNextQuarter} disabled={optimizerLoading} style={{ width: '100%', marginTop: 12, minHeight: 48, fontWeight: 'bold' }}>
                {optimizerLoading ? 'LOADING GAME CONTEXT...' : `PREVIEW Q${quarter + 1} PLAN`}
              </button>
            ) : (
              <>
                <div style={{ marginTop: 14, padding: 10, border: '1px solid #ddd', borderRadius: 8 }}>
                  <strong>Q{quarter + 1} · {nextQuarterFormation}</strong>
                  <div style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>
                    {nextQuarterSituation}: {nextQuarterAdvice.message}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 10px', marginTop: 10, fontSize: 13 }}>
                    {nextQuarterAdvice.suggestedLineup.map(({ position, player }) => (
                      <div key={position}><strong>{positionShort[position] || position}:</strong> #{player.jersey_number ?? '-'} {player.name}</div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 10, fontSize: 13 }}>
                  <strong>Bench:</strong>{' '}
                  {players.filter((player) => !nextQuarterAdvice.suggestedLineup.some(({ player: selected }) => selected.id === player.id))
                    .map((player) => `#${player.jersey_number ?? '-'} ${player.name}`).join(', ') || 'None'}
                </div>

                {nextQuarterAdvice.warnings.length > 0 && (
                  <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: '#fff7e6', fontSize: 12 }}>
                    <strong>Rotation notes</strong>
                    {nextQuarterAdvice.warnings.map((warning) => <div key={warning} style={{ marginTop: 3 }}>{warning}</div>)}
                  </div>
                )}

                <button onClick={applyNextQuarterPlan} disabled={saving} style={{ width: '100%', marginTop: 14, minHeight: 50, fontWeight: 'bold' }}>
                  {saving ? 'SAVING...' : `APPLY Q${quarter + 1} PLAN`}
                </button>
              </>
            )}

            <button onClick={() => { setShowNextQuarterOptimizer(false); setNextQuarterAdvice(null) }} disabled={saving} style={{ width: '100%', marginTop: 8, minHeight: 44 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {canManageGame && showCurrentQuarterOptimizer && gameStatus === 'Live' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: 'white', width: '100%', maxWidth: 700, maxHeight: '88vh', overflowY: 'auto', padding: 16, borderRadius: '14px 14px 0 0', boxSizing: 'border-box' }}>
            <h2 style={{ margin: '0 0 4px' }}>Optimize Q{quarter} NOW</h2>
            <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 12 }}>
              Score: {ourGoals}-{theirGoals}. Uses actual live assignments from earlier quarters when available.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                Game Situation
                <select value={currentQuarterSituation} onChange={(e) => { setCurrentQuarterSituation(e.target.value as GameSituation); setCurrentQuarterAdvice(null) }} style={{ padding: 10 }}>
                  <option>Normal</option>
                  <option>Protect Lead</option>
                  <option>Need Goal</option>
                  <option>Development</option>
                  <option>Pull Back / AYSO Mode</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                Formation
                <select value={currentQuarterFormation} onChange={(e) => { setCurrentQuarterFormation(e.target.value); setCurrentQuarterAdvice(null) }} style={{ padding: 10 }}>
                  {getFormationsForFormat(gameFormat).map((formation) => <option key={formation}>{formation}</option>)}
                </select>
              </label>
            </div>

            {currentFormationSituationWarning && (
              <div
                style={{
                  marginTop: 10,
                  padding: 12,
                  border: '1px solid #d6a84f',
                  borderRadius: 8,
                  background: '#fff7e6',
                  fontSize: 13,
                }}
              >
                <strong>Pull Back Suggestion</strong>
                <div style={{ marginTop: 4 }}>
                  You're protecting a comfortable lead. Consider switching to a more defensive formation before applying this plan.
                </div>
              </div>
            )}

            {!currentQuarterAdvice ? (
              <button onClick={optimizeCurrentQuarter} disabled={optimizerLoading} style={{ width: '100%', marginTop: 12, minHeight: 48, fontWeight: 'bold' }}>
                {optimizerLoading ? 'LOADING GAME CONTEXT...' : `PREVIEW Q${quarter + 1} PLAN`}
              </button>
            ) : (
              <>
                <div style={{ marginTop: 14, padding: 10, border: '1px solid #ddd', borderRadius: 8 }}>
                  <strong>Q{quarter} · {currentQuarterFormation}</strong>
                  <div style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>
                    {currentQuarterSituation}: {currentQuarterAdvice.message}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 10px', marginTop: 10, fontSize: 13 }}>
                    {currentQuarterAdvice.suggestedLineup.map(({ position, player }) => (
                      <div key={position}><strong>{positionShort[position] || position}:</strong> #{player.jersey_number ?? '-'} {player.name}</div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 10, fontSize: 13 }}>
                  <strong>Bench:</strong>{' '}
                  {players.filter((player) => !currentQuarterAdvice.suggestedLineup.some(({ player: selected }) => selected.id === player.id))
                    .map((player) => `#${player.jersey_number ?? '-'} ${player.name}`).join(', ') || 'None'}
                </div>

                {currentQuarterAdvice.warnings.length > 0 && (
                  <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: '#fff7e6', fontSize: 12 }}>
                    <strong>Rotation notes</strong>
                    {currentQuarterAdvice.warnings.map((warning) => <div key={warning} style={{ marginTop: 3 }}>{warning}</div>)}
                  </div>
                )}

                <button onClick={applyCurrentQuarterPlan} disabled={saving} style={{ width: '100%', marginTop: 14, minHeight: 50, fontWeight: 'bold' }}>
                  {saving ? 'SAVING...' : `APPLY Q${quarter + 1} PLAN`}
                </button>
              </>
            )}

            <button onClick={() => { setShowCurrentQuarterOptimizer(false); setCurrentQuarterAdvice(null) }} disabled={saving} style={{ width: '100%', marginTop: 8, minHeight: 44 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showGoal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', width: '100%', maxWidth: 700, padding: 18, borderRadius: '14px 14px 0 0', boxSizing: 'border-box' }}>
            <h2 style={{ marginTop: 0 }}>Our Goal - Q{quarter}</h2>
            <label>Scorer</label>
            <select value={goalScorer} onChange={(e) => setGoalScorer(e.target.value)} style={{ width: '100%', padding: 14, marginTop: 5, fontSize: 16 }}>
              <option value="">Select scorer</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>#{player.jersey_number ?? '-'} {player.name}</option>
              ))}
            </select>
            <label style={{ display: 'block', marginTop: 14 }}>Assist (optional)</label>
            <select value={goalAssister} onChange={(e) => setGoalAssister(e.target.value)} style={{ width: '100%', padding: 14, marginTop: 5, fontSize: 16 }}>
              <option value="">No assist</option>
              {players.filter((player) => player.id !== goalScorer).map((player) => (
                <option key={player.id} value={player.id}>#{player.jersey_number ?? '-'} {player.name}</option>
              ))}
            </select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16 }}>
              <button onClick={() => { setShowGoal(false); setGoalScorer(''); setGoalAssister('') }} style={{ padding: 15, fontSize: 16 }}>
                Cancel
              </button>
              <button onClick={recordOurGoal} disabled={!goalScorer || saving} style={{ padding: 15, fontSize: 16, fontWeight: 'bold' }}>
                Save Goal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
