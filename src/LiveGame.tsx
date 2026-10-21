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
  first_name: string | null
  last_name: string | null
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
  related_goal_id?: string | null
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
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [editEventQuarter, setEditEventQuarter] = useState(1)
  const [editEventScorer, setEditEventScorer] = useState('')
  const [editEventAssister, setEditEventAssister] = useState('')
  const [showGoal, setShowGoal] = useState(false)
  const [showShot, setShowShot] = useState(false)
  const [shotPlayer, setShotPlayer] = useState('')
  const [goalScorer, setGoalScorer] = useState('')
  const [goalAssister, setGoalAssister] = useState('')
  const [saving, setSaving] = useState(false)
  const [gameStatus, setGameStatus] = useState('Scheduled')
  const [loadedCaptainIds, setLoadedCaptainIds] = useState<string[]>(captainIds)
  const normalizedCaptainIds = new Set(
    (loadedCaptainIds.length > 0 ? loadedCaptainIds : captainIds)
      .filter((id): id is string => id != null && String(id).trim() !== '')
      .map((id) => String(id).trim().toLowerCase())
  )
  const [gameFormat, setGameFormat] = useState('7v7')
  const [liveLineup, setLiveLineup] = useState<Lineup[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const [selectedPosition, setSelectedPosition] = useState('')
  const [selectedMovePosition, setSelectedMovePosition] = useState('')
  const [selectedBenchPlayerId, setSelectedBenchPlayerId] = useState('')
  const [subInPlayerId, setSubInPlayerId] = useState('')
  const [liveFormation, setLiveFormation] = useState('3-2-1')
  const [lineupLoading, setLineupLoading] = useState(true)
  const [teamRules, setTeamRules] = useState<TeamRules>(null)
  const [attendance, setAttendance] = useState<Record<string, AttendanceRecord>>({})
  const [actualLiveLineups, setActualLiveLineups] = useState<Lineup[]>([])
  const [optimizerLoading, setOptimizerLoading] = useState(true)
  const [showNextQuarterOptimizer, setShowNextQuarterOptimizer] = useState(false)
  const [nextQuarterSituation, setNextQuarterSituation] = useState<GameSituation>('Normal')
  const [nextQuarterFormation, setNextQuarterFormation] = useState('3-2-1')
  const [nextQuarterAdvice, setNextQuarterAdvice] = useState<RotationAdvice | null>(null)
  const [showCurrentQuarterOptimizer, setShowCurrentQuarterOptimizer] = useState(false)
  const [currentQuarterSituation, setCurrentQuarterSituation] = useState<GameSituation>('Normal')
  const [currentQuarterFormation, setCurrentQuarterFormation] = useState('3-2-1')
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
      .select('status, format, team_id, captain_1_id, captain_2_id')
      .eq('id', gameId)
      .single()

    if (data) {
      setGameStatus(data.status)
      setLoadedCaptainIds([data.captain_1_id, data.captain_2_id].filter((id): id is string => Boolean(id)))
      const format = data.format || '7v7'
      setGameFormat(format)
      let defaultFormation = getDefaultFormationForFormat(format)
      if (data.team_id) {
        const { data: teamData } = await supabase.from('teams').select('default_formation').eq('id', data.team_id).single()
        if (teamData?.default_formation && getFormationsForFormat(format).includes(teamData.default_formation)) {
          defaultFormation = teamData.default_formation
        }
      }
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
      supabase.from('game_attendance').select('player_id, status, arrival_quarter, departure_quarter, available_quarters').eq('game_id', gameId),
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
      attendanceMap[row.player_id] = { status: row.status, arrival_quarter: row.arrival_quarter, departure_quarter: row.departure_quarter ?? null, available_quarters: Array.isArray(row.available_quarters) ? row.available_quarters : null }
    }
    setAttendance(attendanceMap)
    setActualLiveLineups((actualData || []) as Lineup[])
    setOptimizerLoading(false)
  }

  async function loadLiveLineup(targetQuarter: number) {
    const requestId = ++lineupLoadId.current
    setLineupLoading(true)
    setLiveLineup([])

    const [{ data: gameData }, { data: plannedData, error: plannedError }, { data: actualData, error: actualError }] =
      await Promise.all([
        supabase.from('games').select('status').eq('id', gameId).single(),
        supabase
          .from('game_lineups')
          .select('player_id, quarter, position')
          .eq('game_id', gameId)
          .eq('quarter', targetQuarter)
          .order('created_at', { ascending: true }),
        supabase
          .from('game_live_lineups')
          .select('player_id, quarter, position')
          .eq('game_id', gameId)
          .eq('quarter', targetQuarter)
          .order('created_at', { ascending: true }),
      ])

    if (requestId !== lineupLoadId.current) return
    if (plannedError) console.error(plannedError)
    if (actualError) console.error(actualError)

    const useActual = gameData?.status === 'Live' || gameData?.status === 'Completed'
    const selected = useActual && actualData && actualData.length > 0
      ? actualData
      : (plannedData && plannedData.length > 0 ? plannedData : lineups.filter((item) => item.quarter === targetQuarter))

    const nextLineup = selected as Lineup[]
    setLiveLineup(nextLineup)
    setLiveFormation(formationForLineup(nextLineup))
    setLineupLoading(false)
  }

  async function startPositionTracking(targetQuarter: number, targetLineup: Lineup[], startedAt = new Date().toISOString()) {
    const { data: existing, error: existingError } = await supabase
      .from('game_position_segments')
      .select('id')
      .eq('game_id', gameId)
      .eq('quarter', targetQuarter)
      .limit(1)

    if (existingError) {
      console.error(existingError)
      alert(`Could not start position tracking: ${existingError.message}`)
      return false
    }

    if (existing && existing.length > 0) return true

    const activeByPlayer = new Map(targetLineup.map((item) => [item.player_id, item.position]))
    const rows = players.map((player) => ({
      game_id: gameId,
      quarter: targetQuarter,
      player_id: player.id,
      position: activeByPlayer.get(player.id) || 'Bench',
      started_at: startedAt,
    }))

    const { error } = await supabase.from('game_position_segments').insert(rows)
    if (error) {
      console.error(error)
      alert(`Could not start position tracking: ${error.message}`)
      return false
    }

    return true
  }

  async function closePositionTracking(targetQuarter: number, endedAt = new Date().toISOString()) {
    const { error } = await supabase
      .from('game_position_segments')
      .update({ ended_at: endedAt })
      .eq('game_id', gameId)
      .eq('quarter', targetQuarter)
      .is('ended_at', null)

    if (error) {
      console.error(error)
      alert(`Could not close position tracking: ${error.message}`)
      return false
    }

    return true
  }

  async function syncPositionTracking(targetLineup: Lineup[], targetQuarter = quarter, changedAt = new Date().toISOString()) {
    const { data: openSegments, error } = await supabase
      .from('game_position_segments')
      .select('id, player_id, position')
      .eq('game_id', gameId)
      .eq('quarter', targetQuarter)
      .is('ended_at', null)

    if (error) {
      console.error(error)
      alert(`Could not update position tracking: ${error.message}`)
      return false
    }

    if (!openSegments || openSegments.length === 0) {
      return startPositionTracking(targetQuarter, targetLineup, changedAt)
    }

    const desired = new Map(targetLineup.map((item) => [item.player_id, item.position]))
    const changes = openSegments.filter(
      (segment) => (desired.get(segment.player_id) || 'Bench') !== segment.position
    )

    for (const segment of changes) {
      const nextPosition = desired.get(segment.player_id) || 'Bench'
      const { error: closeError } = await supabase
        .from('game_position_segments')
        .update({ ended_at: changedAt })
        .eq('id', segment.id)

      if (closeError) {
        console.error(closeError)
        alert(`Could not save position change: ${closeError.message}`)
        return false
      }

      const { error: insertError } = await supabase
        .from('game_position_segments')
        .insert({
          game_id: gameId,
          quarter: targetQuarter,
          player_id: segment.player_id,
          position: nextPosition,
          started_at: changedAt,
        })

      if (insertError) {
        console.error(insertError)
        alert(`Could not save new position segment: ${insertError.message}`)
        return false
      }
    }

    return true
  }

  async function loadLineupForTracking(targetQuarter: number) {
    const { data: plannedData, error: plannedError } = await supabase
      .from('game_lineups')
      .select('player_id, quarter, position')
      .eq('game_id', gameId)
      .eq('quarter', targetQuarter)

    if (plannedError) console.error(plannedError)
    if (plannedData && plannedData.length > 0) return plannedData as Lineup[]

    const { data: liveData, error: liveError } = await supabase
      .from('game_live_lineups')
      .select('player_id, quarter, position')
      .eq('game_id', gameId)
      .eq('quarter', targetQuarter)

    if (!liveError && liveData && liveData.length > 0) return liveData as Lineup[]

    return lineups.filter((item) => item.quarter === targetQuarter) as Lineup[]
  }

  async function updateGameStatus(nextStatus: 'Scheduled' | 'Live' | 'Completed') {
    if (!canManageGame) return

    setSaving(true)

    if (nextStatus === 'Live' && gameStatus === 'Scheduled') {
      const saved = await persistLiveLineup(activeLineup, quarter)
      if (!saved) {
        setSaving(false)
        return
      }
      const trackingStarted = await startPositionTracking(quarter, activeLineup)
      if (!trackingStarted) {
        setSaving(false)
        return
      }
    }

    if (nextStatus === 'Completed') {
      const saved = await persistLiveLineup(activeLineup, quarter)
      if (!saved) {
        setSaving(false)
        return
      }
      const trackingClosed = await closePositionTracking(quarter)
      if (!trackingClosed) {
        setSaving(false)
        return
      }
    }

    const { error } = await supabase
      .from('games')
      .update({ status: nextStatus })
      .eq('id', gameId)

    if (error) {
      console.error(error)
      alert(`Could not update game status: ${error.message}`)
      setSaving(false)
      return
    }

    setGameStatus(nextStatus)
    setSaving(false)
  }

  async function persistLiveLineup(nextLineup: Lineup[], targetQuarter = quarter, syncTracking = true) {
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

    if (syncTracking && gameStatus === 'Live' && targetQuarter === quarter) {
      const trackingSynced = await syncPositionTracking(nextLineup, targetQuarter)
      if (!trackingSynced) return false
    }

    return true
  }

  async function changeQuarter(nextQuarter: number) {
    if (!canManageGame || nextQuarter === quarter || lineupLoading) return

    const changedAt = new Date().toISOString()
    const saved = await persistLiveLineup(activeLineup, quarter, false)
    if (!saved) return

    if (gameStatus === 'Live') {
      const [closed, nextLineup] = await Promise.all([
        closePositionTracking(quarter, changedAt),
        loadLineupForTracking(nextQuarter),
      ])
      if (!closed) return

      const started = await startPositionTracking(nextQuarter, nextLineup, changedAt)
      if (!started) return
    }

    setQuarter(nextQuarter)
  }

  useEffect(() => {
    loadGame()
    loadEvents()
    loadOptimizerContext()
  }, [gameId])

  useEffect(() => {
    loadLiveLineup(quarter)
    setSelectedPlayerId('')
    setSubInPlayerId('')
  }, [lineups, quarter, gameId, gameFormat])

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

  // Only count players assigned to positions that actually exist in the
  // selected formation as being on the field. Older saved lineups can contain
  // extra or incompatible positions; those players must remain visible on the bench.
  const visibleFormationPositions = new Set(fieldRows().flat())
  const benchPlayers = players.filter(
    (player) => !activeLineup.some(
      (item) => item.player_id === player.id && visibleFormationPositions.has(item.position)
    )
  )

  const selectedPlayer = currentPlayers.find((player) => player.id === selectedPlayerId)

  const ourShots = events.filter((event) => event.event_type === 'our_shot').length
  const teamSaves = events.filter((event) => event.event_type === 'save').length

  const playerStats = players
    .map((player) => {
      const goals = events.filter(
        (event) => event.event_type === 'our_goal' && event.player_id === player.id
      ).length
      const assists = events.filter(
        (event) => event.event_type === 'our_goal' && event.assister_id === player.id
      ).length
      const shots = events.filter(
        (event) => event.event_type === 'our_shot' && event.player_id === player.id
      ).length
      const saves = events.filter(
        (event) => event.event_type === 'save' && event.player_id === player.id
      ).length
      return { ...player, goals, assists, shots, saves }
    })
    .filter((player) => player.goals > 0 || player.assists > 0 || player.shots > 0 || player.saves > 0)

  const formationSituationWarning =
    nextQuarterSituation === 'Pull Back' && nextQuarterFormation !== '4-1-1'
  const currentFormationSituationWarning =
    currentQuarterSituation === 'Pull Back' && currentQuarterFormation !== '4-1-1'

  function playerName(id: string | null) {
    if (!id) return '-'
    const player = players.find((p) => p.id === id)
    return player ? `#${player.jersey_number ?? ''} ${player.first_name || player.name.split(' ')[0]}` : '-'
  }

  function assignPlayerToPosition(playerId: string, position: string) {
    if (!canManageGame || gameStatus !== 'Live') return

    const source = activeLineup.find((item) => item.player_id === playerId)

    // Dropping a field player on the bench removes that player from this quarter's
    // active lineup. Dropping a bench player on the field inserts them into the slot.
    if (position === 'Bench') {
      if (!source) return

      // Manual substitutions must obey the same maximum-bench rule as the optimizer.
      // Count prior quarters where this player was available but not on the field,
      // preferring actual live lineups and falling back to the planned lineup only
      // when no actual lineup was saved for that quarter.
      if (optimizerLoading) {
        alert('Rotation rules are still loading. Please try the substitution again in a moment.')
        return
      }

      const maxBenchQuarters = teamRules?.max_bench_quarters ?? 2
      const playerAttendance = attendance[playerId]
      const wasAvailable = (targetQuarter: number) => {
        if (!playerAttendance) return true
        if (Array.isArray(playerAttendance.available_quarters)) return playerAttendance.available_quarters.includes(targetQuarter)
        if (playerAttendance.status === 'Absent') return false
        if (playerAttendance.status === 'Present') return true
        if (targetQuarter < (playerAttendance.arrival_quarter || 2)) return false
        if (playerAttendance.departure_quarter !== null && targetQuarter > playerAttendance.departure_quarter) return false
        return true
      }
      let priorBenchQuarters = 0
      for (let priorQuarter = 1; priorQuarter < quarter; priorQuarter += 1) {
        if (!wasAvailable(priorQuarter)) continue
        const actualQuarterLineup = actualLiveLineups.filter((item) => item.quarter === priorQuarter)
        const quarterLineup = actualQuarterLineup.length > 0
          ? actualQuarterLineup
          : lineups.filter((item) => item.quarter === priorQuarter)
        if (!quarterLineup.some((item) => item.player_id === playerId)) priorBenchQuarters += 1
      }

      if (priorBenchQuarters >= maxBenchQuarters) {
        alert(`${playerName(playerId)} has already sat ${priorBenchQuarters} quarter(s). The team limit is ${maxBenchQuarters}; this move would exceed the playing-time rule, so the player will stay on the field.`)
        return
      }

      const nextLineup = activeLineup.filter((item) => item.player_id !== playerId)
      setLiveLineup(nextLineup)
      void persistLiveLineup(nextLineup)
      setSelectedPosition('')
      setSelectedMovePosition('')
      setSelectedBenchPlayerId('')
      return
    }

    const occupant = activeLineup.find((item) => item.position === position)
    let nextLineup: Lineup[]

    if (source) {
      nextLineup = activeLineup.map((item) => {
        if (item.player_id === playerId) return { ...item, position }
        if (occupant && item.player_id === occupant.player_id && occupant.player_id !== playerId) {
          return { ...item, position: source.position }
        }
        return item
      })
    } else {
      nextLineup = [
        ...activeLineup.filter((item) => item.player_id !== occupant?.player_id),
        { quarter, player_id: playerId, position },
      ]
    }

    setLiveLineup(nextLineup)
    void persistLiveLineup(nextLineup)
    setSelectedPosition('')
    setSelectedMovePosition('')
    setSelectedBenchPlayerId('')
  }

  function changeFormation(newFormation: string) {
    if (!canManageGame) return
    const slots = optimizationFormations[newFormation]
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
    if (!canStatTrack || !goalScorer || gameStatus !== 'Live' || saving) return
    setSaving(true)
    let savedGoal: Event | null = null

    try {
      const { data: goalData, error: goalError } = await supabase
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

      if (goalError || !goalData) {
        console.error(goalError)
        alert('Could not record goal: ' + (goalError?.message || 'Unknown error'))
        return
      }

      savedGoal = goalData as Event

      const { data: shotData, error: shotError } = await supabase
        .from('game_events')
        .insert({
          game_id: gameId,
          quarter,
          event_type: 'our_shot',
          player_id: goalScorer,
          related_goal_id: savedGoal.id,
        })
        .select()
        .single()

      if (shotError || !shotData) {
        console.error(shotError)
        setEvents((current) => [savedGoal!, ...current.filter((event) => event.id !== savedGoal!.id)])
        alert('Goal recorded, but the automatic shot could not be recorded: ' + (shotError?.message || 'Unknown error'))
      } else {
        setEvents((current) => [
          shotData as Event,
          savedGoal!,
          ...current.filter((event) => event.id !== savedGoal!.id),
        ])
      }

      setGoalScorer('')
      setGoalAssister('')
      setShowGoal(false)
    } catch (error) {
      console.error(error)
      if (savedGoal) {
        setEvents((current) => [savedGoal!, ...current.filter((event) => event.id !== savedGoal!.id)])
        setGoalScorer('')
        setGoalAssister('')
        setShowGoal(false)
        alert('The goal was saved. Another stat update failed, but the score has been refreshed.')
      } else {
        alert('Could not save the goal. Please check Recent Events before trying again.')
      }
    } finally {
      setSaving(false)
    }
  }

  async function recordSave() {
    if (!canStatTrack || gameStatus !== 'Live') return

    const goalkeeper = activeLineup.find((item) => item.position === 'Goalkeeper')
    if (!goalkeeper) {
      alert('No goalkeeper is currently on the field.')
      return
    }

    setSaving(true)
    const { data, error } = await supabase
      .from('game_events')
      .insert({
        game_id: gameId,
        quarter,
        event_type: 'save',
        player_id: goalkeeper.player_id,
      })
      .select()
      .single()

    if (!error && data) {
      setEvents((current) => [data, ...current])
    } else if (error) {
      console.error(error)
      alert(`Could not record save: ${error.message}`)
    }

    setSaving(false)
  }

  async function recordOurShot() {
    if (!canStatTrack || gameStatus !== 'Live' || !shotPlayer) return

    setSaving(true)
    const { data, error } = await supabase
      .from('game_events')
      .insert({
        game_id: gameId,
        quarter,
        event_type: 'our_shot',
        player_id: shotPlayer,
      })
      .select()
      .single()

    if (!error && data) {
      setEvents((current) => [data, ...current])
      setShotPlayer('')
      setShowShot(false)
    } else if (error) {
      console.error(error)
      alert(`Could not record shot: ${error.message}`)
    }

    setSaving(false)
  }

  async function deleteEvent(eventId: string) {
    if (!confirm('Delete this event?')) return
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('game_events')
        .delete()
        .eq('id', eventId)
        .select('id')

      if (error) {
        console.error('Could not delete game event:', error)
        alert(`Could not delete event: ${error.message}`)
        await loadEvents()
        return
      }

      if (!data || data.length === 0) {
        alert('The event was not deleted. It may no longer exist or you may not have permission to delete it. Refreshing events now.')
        await loadEvents()
        return
      }

      setEvents((current) => current.filter((event) => event.id !== eventId && event.related_goal_id !== eventId))
    } catch (error) {
      console.error('Unexpected error deleting game event:', error)
      alert('Could not confirm that the event was deleted. Refreshing events now.')
      await loadEvents()
    } finally {
      setSaving(false)
    }
  }

  function openEditEvent(event: Event) {
    if (!canManageGame) return

    setEditingEvent(event)
    setEditEventQuarter(event.quarter)
    setEditEventScorer(event.player_id || '')
    setEditEventAssister(event.assister_id || '')
    setSaving(false)
  }

  function closeEditEvent() {
    if (saving) return
    setEditingEvent(null)
    setEditEventQuarter(1)
    setEditEventScorer('')
    setEditEventAssister('')
  }

  async function saveEditedEvent() {
    if (!editingEvent || !canManageGame) return

    if (
      (editingEvent.event_type === 'our_goal' ||
        editingEvent.event_type === 'save' ||
        editingEvent.event_type === 'our_shot') &&
      !editEventScorer
    ) {
      alert(editingEvent.event_type === 'our_goal' ? 'Select the goal scorer.' : 'Select the player.')
      return
    }

    setSaving(true)

    const playerAttributedEvent =
      editingEvent.event_type === 'our_goal' ||
      editingEvent.event_type === 'save' ||
      editingEvent.event_type === 'our_shot'

    const payload = {
      quarter: editEventQuarter,
      player_id: playerAttributedEvent ? editEventScorer : null,
      assister_id: editingEvent.event_type === 'our_goal' ? editEventAssister || null : null,
    }

    const { data, error } = await supabase
      .from('game_events')
      .update(payload)
      .eq('id', editingEvent.id)
      .select()
      .single()

    if (error || !data) {
      console.error(error)
      alert(`Could not update event: ${error?.message || 'Unknown error'}`)
      setSaving(false)
      return
    }

    let linkedShots: Event[] = []

    if (editingEvent.event_type === 'our_goal') {
      const { data: shotData, error: shotError } = await supabase
        .from('game_events')
        .update({
          quarter: editEventQuarter,
          player_id: editEventScorer,
        })
        .eq('related_goal_id', editingEvent.id)
        .eq('event_type', 'our_shot')
        .select()

      if (shotError) {
        console.error('Could not update the shot linked to the edited goal:', shotError)

        const { error: rollbackError } = await supabase
          .from('game_events')
          .update({
            quarter: editingEvent.quarter,
            player_id: editingEvent.player_id,
            assister_id: editingEvent.assister_id,
          })
          .eq('id', editingEvent.id)

        if (rollbackError) {
          console.error('Could not roll back goal after linked-shot update failed:', rollbackError)
        }

        await loadEvents()
        alert(
          rollbackError
            ? 'The linked shot could not be updated, and the goal could not be rolled back cleanly. The event list has been refreshed; please verify both entries.'
            : 'The linked shot could not be updated, so the goal edit was rolled back. Please try again.'
        )
        setSaving(false)
        return
      }

      linkedShots = (shotData || []) as Event[]
    }

    setEvents((current) =>
      current.map((event) => {
        if (event.id === editingEvent.id) return data as Event
        const linkedShot = linkedShots.find((shot) => shot.id === event.id)
        return linkedShot || event
      })
    )

    setEditingEvent(null)
    setEditEventQuarter(1)
    setEditEventScorer('')
    setEditEventAssister('')
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
    if (!currentQuarterAdvice || !currentQuarterAdvice.canApply) return
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
    if (!nextQuarterAdvice || !nextQuarterAdvice.canApply || quarter >= 4) return
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
    // Keep every formation slot visible, including unoccupied positions, so a player
    // can be moved from the bench directly into an empty slot.
    return rows
  }

  function handleFieldPlayerTap(position: string) {
    if (!canManageGame || gameStatus !== 'Live') return

    // A selected bench player can be placed directly into a field slot by tapping it.
    if (selectedBenchPlayerId) {
      assignPlayerToPosition(selectedBenchPlayerId, position)
      setSelectedBenchPlayerId('')
      setSelectedMovePosition('')
      return
    }

    if (!selectedMovePosition) {
      setSelectedMovePosition(position)
      return
    }
    if (selectedMovePosition === position) {
      setSelectedMovePosition('')
      setSelectedPosition(position)
      return
    }
    const source = activeLineup.find((entry) => entry.position === selectedMovePosition)
    if (source) assignPlayerToPosition(source.player_id, position)
    setSelectedMovePosition('')
  }

  function fieldPlayer(position: string) {
    const item = activeLineup.find((entry) => entry.position === position)
    if (!item) return null
    const player = players.find((entry) => entry.id === item.player_id)
    if (!player) return null

    const isGk = position === 'Goalkeeper'
    const isSelected = selectedMovePosition === position
    const fullName = player.name?.trim() || [player.first_name, player.last_name].filter(Boolean).join(' ')
    const firstName = player.first_name?.trim() || fullName.split(/\s+/).filter(Boolean)[0] || 'Player'
    const lastName = player.last_name?.trim() || fullName.split(/\s+/).filter(Boolean).slice(-1)[0] || ''
    const displayName = lastName && lastName.toLowerCase() !== firstName.toLowerCase()
      ? `${firstName} ${lastName.charAt(0).toUpperCase()}.`
      : firstName
    const normalizedPlayerId = String(player.id).trim().toLowerCase()
    const isCaptain = normalizedCaptainIds.has(normalizedPlayerId)

    return (
      <button
        key={`${position}-${player.id}`}
        type="button"
        draggable={Boolean(canManageGame && gameStatus === 'Live')}
        onDragStart={(event) => {
          event.dataTransfer.setData('text/plain', player.id)
          event.dataTransfer.effectAllowed = 'move'
          setSelectedMovePosition(position)
        }}
        onDragEnd={() => setSelectedMovePosition('')}
        onDragOver={(event) => {
          if (canManageGame && gameStatus === 'Live') {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
          }
        }}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const draggedPlayerId = event.dataTransfer.getData('text/plain')
          if (draggedPlayerId && canManageGame && gameStatus === 'Live') {
            assignPlayerToPosition(draggedPlayerId, position)
          }
          setSelectedMovePosition('')
          setSelectedBenchPlayerId('')
        }}
        onClick={() => handleFieldPlayerTap(position)}
        disabled={!canManageGame || gameStatus !== 'Live'}
        aria-label={`#${player.jersey_number ?? '-'} ${displayName}, ${position}. Drag or select to move.`}
        style={{
          background: 'transparent',
          border: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          justifySelf: 'center',
          width: 'auto',
          minWidth: 0,
          maxWidth: '100%',
          padding: 0,
          gap: 0,
          cursor: canManageGame && gameStatus === 'Live' ? 'grab' : 'default',
          touchAction: 'manipulation',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          transition: 'transform 0.15s ease',
          transform: isSelected ? 'scale(1.06)' : 'none',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <span
          style={{
            width: 46,
            height: 46,
            flex: '0 0 46px',
            boxSizing: 'border-box',
            borderRadius: '50%',
            background: isGk
              ? 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)'
              : 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
            border: isSelected
              ? '3px solid #fbbf24'
              : isGk
                ? '2.5px solid #fef08a'
                : '2.5px solid #a7f3d0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: isGk ? '#451a03' : '#022c22',
            boxShadow: isSelected
              ? '0 0 18px rgba(251,191,36,.8)'
              : isGk
                ? '0 5px 12px rgba(245,158,11,.35)'
                : '0 5px 12px rgba(16,185,129,.32)',
            position: 'relative',
          }}
        >
          {isCaptain && <span aria-label="Captain" title="Captain" style={{ position: 'absolute', top: -5, right: -5, width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fbbf24', border: '2px solid #0f172a', color: '#422006', fontSize: 11, fontWeight: 950, lineHeight: 1, zIndex: 3 }}>C</span>}
          <span style={{ fontSize: 12, fontWeight: 900, lineHeight: 1 }}>
            #{player.jersey_number ?? '-'}
          </span>
          <span style={{ fontSize: 8, fontWeight: 800, marginTop: 2, textTransform: 'uppercase' }}>
            {positionShort[position] || position}
          </span>
        </span>
        <span
          style={{
            display: 'block',
            marginTop: 6,
            maxWidth: 'min(132px, 28vw)',
            padding: '4px 9px',
            boxSizing: 'border-box',
            borderRadius: 8,
            border: isSelected ? '1px solid #fbbf24' : '1px solid rgba(255,255,255,.15)',
            background: 'rgba(15,23,42,.94)',
            color: '#f8fafc',
            fontSize: 12,
            fontWeight: 900,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            boxShadow: '0 4px 8px rgba(0,0,0,.3)',
          }}
        >
          {displayName}

        </span>
      </button>
    )
  }

  return (
    <div className="live-game-page" style={{ maxWidth: 560, margin: '0 auto', padding: 12, paddingBottom: 90, color: '#f8fafc', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <button onClick={onBack} style={{ padding: '8px 14px', marginBottom: 12, minHeight: 40, borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', fontWeight: 600, cursor: 'pointer' }}>
        ← Back
      </button>

      <div className="live-game-scoreboard" style={{ textAlign: 'center', padding: '12px 0 18px', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', borderRadius: 16, border: '1px solid #334155', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: '#38bdf8', marginBottom: 4 }}>{gameStatus.toUpperCase()}</div>
        <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#f8fafc' }}>vs {opponent}</h1>
        <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.02em', color: '#ffffff', textShadow: '0 2px 10px rgba(56,189,248,0.3)' }}>
          {ourGoals} - {theirGoals}
        </div>
        {captainIds.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 13, color: '#94a3b8' }}>
            <strong style={{ color: '#cbd5e1' }}>Captains:</strong> {captainIds.map((id) => playerName(id)).join('  |  ')}
          </div>
        )}
      </div>

      {canManageGame && gameStatus === 'Scheduled' && (
        <button
          onClick={() => updateGameStatus('Live')}
          disabled={saving}
          style={{ width: '100%', minHeight: 60, fontSize: 18, fontWeight: 800, marginBottom: 12, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: '#fff', boxShadow: '0 4px 14px rgba(2,132,199,0.4)', cursor: 'pointer' }}
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
          style={{ width: '100%', minHeight: 46, fontSize: 14, fontWeight: 700, marginBottom: 12, borderRadius: 10, border: '1px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', cursor: 'pointer' }}
        >
          END GAME
        </button>
      )}

      {canManageGame && gameStatus === 'Completed' && (
        <button
          onClick={() => updateGameStatus('Live')}
          disabled={saving}
          style={{ width: '100%', minHeight: 46, fontSize: 14, fontWeight: 700, marginBottom: 12, borderRadius: 10, border: '1px solid #334155', background: '#1e293b', color: '#cbd5e1', cursor: 'pointer' }}
        >
          REOPEN GAME
        </button>
      )}

      <div className="live-game-quarter-tabs" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12 }}>
        {[1, 2, 3, 4].map((q) => (
          <button
            key={q}
            onClick={() => changeQuarter(q)}
            disabled={lineupLoading}
            style={{ 
              padding: '10px 4px', 
              fontWeight: quarter === q ? 800 : 600, 
              fontSize: 15, 
              minHeight: 44,
              borderRadius: 10,
              border: quarter === q ? '2px solid #38bdf8' : '1px solid #334155',
              background: quarter === q ? '#0284c7' : '#1e293b',
              color: '#ffffff',
              cursor: 'pointer',
              boxShadow: quarter === q ? '0 0 12px rgba(56,189,248,0.4)' : 'none'
            }}
          >
            Q{q}
          </button>
        ))}
      </div>

      {canManageGame && gameStatus === 'Live' && (
        <button
          onClick={openCurrentQuarterOptimizer}
          disabled={lineupLoading || optimizerLoading}
          style={{ width: '100%', minHeight: 46, fontSize: 14, fontWeight: 700, marginBottom: 8, borderRadius: 10, border: '1px solid #0284c7', background: '#0369a1', color: '#fff', cursor: 'pointer' }}
        >
          {optimizerLoading ? 'PREPARING...' : `⚡ OPTIMIZE Q${quarter} NOW`}
        </button>
      )}

      {canManageGame && gameStatus === 'Live' && quarter < 4 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <button
            onClick={openNextQuarterOptimizer}
            disabled={lineupLoading || optimizerLoading}
            style={{ minHeight: 46, fontSize: 13, fontWeight: 700, borderRadius: 10, border: '1px solid #334155', background: '#1e293b', color: '#cbd5e1', cursor: 'pointer' }}
          >
            {optimizerLoading ? 'PREPARING...' : `⚡ OPTIMIZE Q${quarter + 1}`}
          </button>
          <button
            onClick={() => changeQuarter(quarter + 1)}
            disabled={lineupLoading}
            style={{ minHeight: 46, fontSize: 14, fontWeight: 700, borderRadius: 10, border: '1px solid #0284c7', background: '#0284c7', color: '#fff', cursor: 'pointer' }}
          >
            {lineupLoading ? 'LOADING...' : `START Q${quarter + 1} →`}
          </button>
        </div>
      )}

      <div className="live-game-event-actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setShowGoal(true)}
          disabled={gameStatus !== 'Live' || saving}
          style={{ minHeight: 56, fontSize: 15, fontWeight: 800, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', boxShadow: '0 4px 12px rgba(16,185,129,0.3)', cursor: 'pointer' }}
        >
          ⚽ OUR GOAL
        </button>
        <button
          onClick={recordTheirGoal}
          disabled={gameStatus !== 'Live' || saving}
          style={{ minHeight: 56, fontSize: 15, fontWeight: 800, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', color: '#fff', boxShadow: '0 4px 12px rgba(239,68,68,0.3)', cursor: 'pointer' }}
        >
          ❌ THEIR GOAL
        </button>
        <button
          onClick={recordSave}
          disabled={gameStatus !== 'Live' || saving || lineupLoading}
          style={{ minHeight: 48, fontSize: 14, fontWeight: 700, borderRadius: 12, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', cursor: 'pointer' }}
        >
          🧤 SAVE
        </button>
        <button
          onClick={() => { setShotPlayer(''); setShowShot(true) }}
          disabled={gameStatus !== 'Live' || saving || lineupLoading}
          style={{ minHeight: 48, fontSize: 14, fontWeight: 700, borderRadius: 12, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', cursor: 'pointer' }}
        >
          🎯 OUR SHOT
        </button>
      </div>

      <section className="live-game-lineup-card" style={{ marginTop: 12, border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#0f172a', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#f8fafc' }}>Q{quarter} Formation</h2>
          {canManageGame && gameStatus === 'Live' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Formation</span>
              <select
                value={liveFormation}
                onChange={(e) => changeFormation(e.target.value)}
                style={{ padding: '6px 10px', fontWeight: 700, borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', cursor: 'pointer' }}
              >
                {getFormationsForFormat(gameFormat).map((formation) => (
                  <option key={formation} value={formation}>{formation}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {lineupLoading ? (
          <p style={{ margin: 0, fontWeight: 600, color: '#94a3b8', textAlign: 'center', padding: '40px 0' }}>Loading Q{quarter} lineup...</p>
        ) : activeLineup.length === 0 ? (
          <p style={{ margin: 0, color: '#94a3b8', textAlign: 'center', padding: '40px 0' }}>No saved lineup for this quarter.</p>
        ) : (
          <>
            {/* BROADCAST TACTICAL PITCH OVERHAUL */}
            <div
              className="live-game-pitch"
              style={{
                background: 'repeating-linear-gradient(180deg, #0a3822 0px, #0a3822 32px, #0e442d 32px, #0e442d 64px)',
                border: '2px solid #10b981',
                borderRadius: 12,
                padding: '8px',
                display: 'grid',
                gridTemplateRows: fieldRows().map(() => 'minmax(72px, 1fr)').join(' '),
                gap: 8,
                minHeight: 370,
                boxSizing: 'border-box',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: 'inset 0 0 40px rgba(0,0,0,0.6)',
              }}
            >
              {/* Pitch Markings Overlay */}
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {/* Center Halfway Line */}
                <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: 'rgba(255, 255, 255, 0.25)', transform: 'translateY(-50%)' }} />
                {/* Center Circle */}
                <div style={{ position: 'absolute', top: '50%', left: '50%', width: 100, height: 100, borderRadius: '50%', border: '2px solid rgba(255, 255, 255, 0.25)', transform: 'translate(-50%, -50%)' }} />
                {/* Penalty Area Top */}
                <div style={{ position: 'absolute', top: 0, left: '25%', right: '25%', height: 50, border: '2px solid rgba(255, 255, 255, 0.25)', borderTop: 'none' }} />
                {/* Penalty Area Bottom */}
                <div style={{ position: 'absolute', bottom: 0, left: '25%', right: '25%', height: 50, border: '2px solid rgba(255, 255, 255, 0.25)', borderBottom: 'none' }} />
              </div>

              {/* Player Grid Lines */}
              {fieldRows().map((row, rowIndex) => (
                <div
                  key={`row-${rowIndex}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-around',
                    alignItems: 'center',
                    gap: 4,
                    minWidth: 0,
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  {row.map((position) => (
                    <div
                      key={position}
                      onDragOver={(event) => {
                        if (canManageGame && gameStatus === 'Live') {
                          event.preventDefault()
                          event.dataTransfer.dropEffect = 'move'
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        const draggedPlayerId = event.dataTransfer.getData('text/plain')
                        if (draggedPlayerId && canManageGame && gameStatus === 'Live') {
                          assignPlayerToPosition(draggedPlayerId, position)
                        }
                        setSelectedMovePosition('')
                        setSelectedBenchPlayerId('')
                      }}
                      style={{ flex: row.length === 1 ? '0 1 auto' : '1 1 0', display: 'flex', justifyContent: 'center', alignItems: 'center', minWidth: 0, minHeight: 74, borderRadius: 8 }}
                    >
                      {activeLineup.some((item) => item.position === position)
                        ? fieldPlayer(position)
                        : (
                          <button
                            type="button"
                            className="live-game-empty-slot"
                            onClick={() => handleFieldPlayerTap(position)}
                            onDragOver={(event) => {
                              if (canManageGame && gameStatus === 'Live') {
                                event.preventDefault()
                                event.dataTransfer.dropEffect = 'move'
                              }
                            }}
                            onDrop={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              const draggedPlayerId = event.dataTransfer.getData('text/plain')
                              if (draggedPlayerId && canManageGame && gameStatus === 'Live') {
                                assignPlayerToPosition(draggedPlayerId, position)
                              }
                              setSelectedMovePosition('')
                              setSelectedBenchPlayerId('')
                            }}
                            disabled={!canManageGame || gameStatus !== 'Live'}
                            aria-label={`Empty ${positionShort[position] || position} position. Drop or tap a player here.`}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '100%',
                              minWidth: 0,
                              padding: 0,
                              cursor: canManageGame && gameStatus === 'Live' ? 'pointer' : 'default',
                              touchAction: 'manipulation',
                            }}
                          >
                            <span style={{
                              width: 50,
                              height: 50,
                              flex: '0 0 50px',
                              boxSizing: 'border-box',
                              borderRadius: '50%',
                              background: 'rgba(15, 23, 42, 0.65)',
                              border: selectedBenchPlayerId || selectedMovePosition ? '2px dashed #34d399' : '2px dashed rgba(52,211,153,.8)',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#34d399',
                            }}>
                              <span style={{ fontSize: 13, fontWeight: 900, lineHeight: 1 }}>+</span>
                              <span style={{ fontSize: 8, fontWeight: 800, marginTop: 2, color: '#6ee7b7' }}>{positionShort[position] || position}</span>
                            </span>
                            <span style={{
                              display: 'block',
                              marginTop: 6,
                              background: 'rgba(0, 0, 0, 0.6)',
                              border: '1px solid rgba(255, 255, 255, 0.15)',
                              padding: '4px 10px',
                              borderRadius: 8,
                              fontSize: 12,
                              fontWeight: 900,
                              lineHeight: 1.2,
                              color: '#34d399',
                              whiteSpace: 'nowrap',
                              boxShadow: '0 4px 8px rgba(0,0,0,0.4)',
                            }}>Assign</span>
                          </button>
                        )}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8', textAlign: 'center', fontWeight: 500 }}>
              Tap a player, then tap another position to move or swap. Tap the same player twice to choose a replacement.
            </div>

            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #334155' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>Bench</div>
              <div
                onDragOver={(event) => {
                  if (canManageGame && gameStatus === 'Live') {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const draggedPlayerId = event.dataTransfer.getData('text/plain')
                  if (draggedPlayerId && canManageGame && gameStatus === 'Live') {
                    assignPlayerToPosition(draggedPlayerId, 'Bench')
                  }
                }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: 6,
                  minHeight: 52,
                  padding: 4,
                  borderRadius: 8,
                  background: 'rgba(15,23,42,.24)',
                }}
              >
                {benchPlayers.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    draggable={Boolean(canManageGame && gameStatus === 'Live')}
                    onDragStart={(event) => {
                      event.dataTransfer.setData('text/plain', player.id)
                      event.dataTransfer.effectAllowed = 'move'
                      setSelectedBenchPlayerId(player.id)
                    }}
                    onDragEnd={() => setSelectedBenchPlayerId('')}
                    onDragOver={(event) => {
                      if (canManageGame && gameStatus === 'Live') {
                        event.preventDefault()
                        event.dataTransfer.dropEffect = 'move'
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      const draggedPlayerId = event.dataTransfer.getData('text/plain')
                      if (draggedPlayerId && canManageGame && gameStatus === 'Live' && draggedPlayerId !== player.id) {
                        // Dropping onto a bench player returns the dragged field player to the bench.
                        assignPlayerToPosition(draggedPlayerId, 'Bench')
                      }
                    }}
                    onClick={() => { setSelectedMovePosition(''); if (canManageGame && gameStatus === 'Live') setSelectedBenchPlayerId(player.id) }}
                    disabled={!canManageGame || gameStatus !== 'Live'}
                    style={{
                      padding: '8px 10px',
                      textAlign: 'left',
                      minHeight: 52,
                      border: '1px dashed #475569',
                      borderRadius: 10,
                      background: '#1e293b',
                      color: '#f8fafc',
                      cursor: canManageGame && gameStatus === 'Live' ? 'grab' : 'default',
                      touchAction: 'manipulation',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 12 }}>#{player.jersey_number ?? '-'} {player.first_name || player.name.split(' ')[0]}</div>
                    {gameStatus === 'Live' && <div style={{ fontSize: 10, marginTop: 2, color: '#38bdf8', fontWeight: 600 }}>Drag to field · tap to move</div>}
                  </button>
                ))}
                {benchPlayers.length === 0 && <div style={{ color: '#94a3b8', fontSize: 12, padding: 8 }}>Drop a player here to bench them.</div>}
              </div>
            </div>
          </>
        )}
      </section>      

      {canManageGame && selectedPosition && (
        <div onClick={() => { setSelectedPosition(''); setSelectedBenchPlayerId('') }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', width: '100%', maxWidth: 700, padding: '20px 20px calc(20px + env(safe-area-inset-bottom))', borderRadius: '20px 20px 0 0', boxSizing: 'border-box', boxShadow: '0 -10px 25px rgba(0,0,0,0.5)' }}>
            {selectedBenchPlayerId ? (
              <>
                <h2 style={{ marginTop: 0, fontSize: 18, color: '#f8fafc' }}>Move {playerName(selectedBenchPlayerId)} to...</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, maxHeight: '50vh', overflowY: 'auto' }}>
                  {(formationRows[liveFormation] || []).flat().filter((position) => activeLineup.some((item) => item.position === position)).map((position) => (
                    <button key={position} onClick={() => { assignPlayerToPosition(selectedBenchPlayerId, position); setSelectedBenchPlayerId('') }} disabled={gameStatus !== 'Live'} style={{ padding: 12, borderRadius: 10, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', cursor: 'pointer', textAlign: 'left' }}>
                      <strong style={{ color: '#38bdf8', fontSize: 13 }}>{positionShort[position] || position}</strong>
                      <div style={{ fontSize: 11, marginTop: 2, color: '#94a3b8' }}>{position}</div>
                    </button>
                  ))}
                </div>
                <button onClick={() => setSelectedBenchPlayerId('')} style={{ width: '100%', marginTop: 14, padding: 12, borderRadius: 10, border: '1px solid #334155', background: '#334155', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              </>
            ) : (
              <>
                <h2 style={{ marginTop: 0, fontSize: 18, color: '#f8fafc' }}>Move {positionShort[selectedPosition] || selectedPosition} to...</h2>
                <div style={{ marginBottom: 12, fontSize: 13, color: '#94a3b8' }}>{selectedPosition}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxHeight: '50vh', overflowY: 'auto' }}>
                  {players.map((player) => (
                    <button key={player.id} onClick={() => assignPlayerToPosition(player.id, selectedPosition)} disabled={gameStatus !== 'Live'} style={{ padding: 10, minHeight: 58, borderRadius: 10, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc', cursor: 'pointer', textAlign: 'left' }}>
                      <strong style={{ fontSize: 13 }}>#{player.jersey_number ?? '-'} {player.first_name || player.name.split(' ')[0]}</strong>
                      {activeLineup.some((item) => item.player_id === player.id) && (
                        <div style={{ fontSize: 10, marginTop: 2, color: '#38bdf8', fontWeight: 600 }}>
                          {positionShort[activeLineup.find((item) => item.player_id === player.id)?.position || ''] || activeLineup.find((item) => item.player_id === player.id)?.position}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                <button onClick={() => setSelectedPosition('')} style={{ width: '100%', marginTop: 14, padding: 12, borderRadius: 10, border: '1px solid #334155', background: '#334155', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              </>
            )}
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
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(8px)',
            borderTop: '1px solid #334155',
            padding: '10px 12px',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ maxWidth: 560, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 8 }}>
            <button onClick={() => setShowGoal(true)} disabled={saving || lineupLoading} style={{ minHeight: 48, fontWeight: 800, borderRadius: 10, border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer' }}>
              + GOAL
            </button>
            <button onClick={recordTheirGoal} disabled={saving || lineupLoading} style={{ minHeight: 48, fontWeight: 800, borderRadius: 10, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer' }}>
              + OPP GOAL
            </button>
            {quarter < 4 ? (
              <button onClick={() => changeQuarter(quarter + 1)} disabled={lineupLoading} style={{ minHeight: 48, fontWeight: 800, borderRadius: 10, border: 'none', background: '#0284c7', color: '#fff', cursor: 'pointer' }}>
                Q{quarter + 1} →
              </button>
            ) : (
              canManageGame ? (
                <button onClick={() => updateGameStatus('Completed')} disabled={saving} style={{ minHeight: 48, fontWeight: 800, borderRadius: 10, border: 'none', background: '#334155', color: '#fff', cursor: 'pointer' }}>
                  END GAME
                </button>
              ) : (
                <button onClick={() => setQuarter(1)} disabled={lineupLoading} style={{ minHeight: 48, fontWeight: 800, borderRadius: 10, border: 'none', background: '#334155', color: '#fff', cursor: 'pointer' }}>Q1</button>
              )
            )}
          </div>
        </div>
      )}

      {(playerStats.length > 0 || ourShots > 0 || teamSaves > 0) && (
        <section className="live-game-stats-card" style={{ marginTop: 14, border: '1px solid #334155', borderRadius: 16, padding: 14, background: '#0f172a' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>Game Stats</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: playerStats.length > 0 ? 12 : 0 }}>
            <span style={{ padding: '6px 12px', borderRadius: 8, fontWeight: 700, fontSize: 13, background: '#1e293b', border: '1px solid #334155', color: '#38bdf8' }}>Shots: {ourShots}</span>
            <span style={{ padding: '6px 12px', borderRadius: 8, fontWeight: 700, fontSize: 13, background: '#1e293b', border: '1px solid #334155', color: '#34d399' }}>Saves: {teamSaves}</span>
          </div>
          {playerStats.length > 0 && (
            <div style={{ display: 'grid', gap: 8 }}>
              {playerStats.map((player) => (
                <div key={player.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', border: '1px solid #334155', borderRadius: 10, background: '#1e293b' }}>
                  <strong style={{ fontSize: 15, color: '#f8fafc' }}>#{player.jersey_number ?? '-'} {player.first_name || player.name.split(' ')[0]}</strong>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {player.goals > 0 && <span style={{ padding: '4px 8px', borderRadius: 6, fontWeight: 700, fontSize: 12, background: 'rgba(16,185,129,0.2)', color: '#34d399', border: '1px solid #059669' }}>⚽ {player.goals}</span>}
                    {player.assists > 0 && <span style={{ padding: '4px 8px', borderRadius: 6, fontWeight: 700, fontSize: 12, background: 'rgba(56,189,248,0.2)', color: '#38bdf8', border: '1px solid #0284c7' }}>A {player.assists}</span>}
                    {player.shots > 0 && <span style={{ padding: '4px 8px', borderRadius: 6, fontWeight: 700, fontSize: 12, background: 'rgba(148,163,184,0.2)', color: '#cbd5e1', border: '1px solid #475569' }}>S {player.shots}</span>}
                    {player.saves > 0 && <span style={{ padding: '4px 8px', borderRadius: 6, fontWeight: 700, fontSize: 12, background: 'rgba(234,179,8,0.2)', color: '#facc15', border: '1px solid #ca8a04' }}>🧤 {player.saves}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <details className="live-game-events-card" style={{ marginTop: 12, border: '1px solid #334155', borderRadius: 16, padding: '0 14px', background: '#0f172a' }}>
        <summary style={{ padding: '14px 2px', fontWeight: 700, cursor: 'pointer', color: '#f8fafc', fontSize: 15 }}>Recent Events ({events.length})</summary>
        <div style={{ paddingBottom: 8 }}>
          {events.length === 0 ? (
            <p style={{ margin: '0 0 10px', color: '#94a3b8' }}>No events yet.</p>
          ) : (
            events.slice(0, 30).map((event) => (
              <div key={event.id} style={{ padding: '10px 0', borderTop: '1px solid #1e293b' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: event.event_type === 'our_goal' ? '#34d399' : event.event_type === 'their_goal' ? '#f87171' : '#f8fafc', fontSize: 14 }}>{
                    event.event_type === 'our_goal'
                      ? '⚽ OUR GOAL'
                      : event.event_type === 'their_goal'
                        ? '❌ THEIR GOAL'
                        : event.event_type === 'save'
                          ? '🧤 SAVE'
                          : event.event_type === 'our_shot'
                            ? '🎯 OUR SHOT'
                            : event.event_type.toUpperCase()
                  }</strong>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {canManageGame && (
                      <button onClick={() => openEditEvent(event)} disabled={saving} style={{ padding: '4px 8px', fontSize: 11, borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#cbd5e1', cursor: 'pointer' }}>
                        Edit
                      </button>
                    )}
                    <button onClick={() => deleteEvent(event.id)} disabled={saving} style={{ padding: '4px 8px', fontSize: 11, borderRadius: 6, border: '1px solid #ef4444', background: 'rgba(239,68,68,0.1)', color: '#fca5a5', cursor: 'pointer' }}>
                      Delete
                    </button>
                  </div>
                </div>
                {(event.event_type === 'our_goal' || event.event_type === 'save' || event.event_type === 'our_shot') && event.player_id && (
                  <div style={{ marginTop: 4, color: '#cbd5e1', fontSize: 13 }}>
                    {playerName(event.player_id)}
                    {event.event_type === 'our_goal' && event.assister_id && <span style={{ color: '#94a3b8' }}> — Assist: {playerName(event.assister_id)}</span>}
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>Q{event.quarter}</div>
              </div>
            ))
          )}
        </div>
      </details>

      {canManageGame && editingEvent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            zIndex: 1200,
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              color: '#f8fafc',
              width: '100%',
              maxWidth: 700,
              padding: 20,
              borderRadius: '20px 20px 0 0',
              boxSizing: 'border-box',
              boxShadow: '0 -10px 25px rgba(0,0,0,0.5)',
            }}
          >
            <h2 style={{ margin: '0 0 4px', fontSize: 18, color: '#f8fafc' }}>
              Edit {editingEvent.event_type === 'our_goal' ? 'Our Goal' : 'Their Goal'}
            </h2>

            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>
              Correct the event without rewinding the game.
            </div>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={{ display: 'block', marginBottom: 4, fontWeight: 700, fontSize: 13, color: '#cbd5e1' }}>
                Quarter
              </span>
              <select
                value={editEventQuarter}
                onChange={(e) => setEditEventQuarter(Number(e.target.value))}
                style={{ width: '100%', padding: 10, boxSizing: 'border-box', borderRadius: 10, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc' }}
              >
                <option value={1}>Q1</option>
                <option value={2}>Q2</option>
                <option value={3}>Q3</option>
                <option value={4}>Q4</option>
              </select>
            </label>

            {editingEvent.event_type === 'our_goal' && (
              <>
                <label style={{ display: 'block', marginBottom: 12 }}>
                  <span style={{ display: 'block', marginBottom: 4, fontWeight: 700, fontSize: 13, color: '#cbd5e1' }}>
                    Goal Scorer
                  </span>
                  <select
                    value={editEventScorer}
                    onChange={(e) => setEditEventScorer(e.target.value)}
                    style={{ width: '100%', padding: 10, boxSizing: 'border-box', borderRadius: 10, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc' }}
                  >
                    <option value="">Select scorer</option>
                    {players.map((player) => (
                      <option key={player.id} value={player.id}>
                        #{player.jersey_number ?? '-'} {player.first_name || player.name.split(' ')[0]}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: 'block', marginBottom: 16 }}>
                  <span style={{ display: 'block', marginBottom: 4, fontWeight: 700, fontSize: 13, color: '#cbd5e1' }}>
                    Assist
                  </span>
                  <select
                    value={editEventAssister}
                    onChange={(e) => setEditEventAssister(e.target.value)}
                    style={{ width: '100%', padding: 10, boxSizing: 'border-box', borderRadius: 10, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc' }}
                  >
                    <option value="">No assist</option>
                    {players.map((player) => (
                      <option key={player.id} value={player.id}>
                        #{player.jersey_number ?? '-'} {player.first_name || player.name.split(' ')[0]}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={saveEditedEvent}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  fontWeight: 700,
                  borderRadius: 10,
                  border: 'none',
                  background: '#0284c7',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                {saving ? 'SAVING...' : 'SAVE CHANGES'}
              </button>

              <button
                onClick={closeEditEvent}
                disabled={saving}
                style={{
                  padding: '12px 14px',
                  fontWeight: 700,
                  borderRadius: 10,
                  border: '1px solid #334155',
                  background: '#334155',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {canManageGame && showNextQuarterOptimizer && quarter < 4 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', width: '100%', maxWidth: 700, maxHeight: '88vh', overflowY: 'auto', padding: 20, borderRadius: '20px 20px 0 0', boxSizing: 'border-box', boxShadow: '0 -10px 25px rgba(0,0,0,0.5)' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 18, color: '#f8fafc' }}>Optimize Q{quarter + 1}</h2>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>
              Score: {ourGoals}-{theirGoals}. Uses actual live assignments from earlier quarters when available.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>
                Game Situation
                <select value={nextQuarterSituation} onChange={(e) => { setNextQuarterSituation(e.target.value as GameSituation); setNextQuarterAdvice(null) }} style={{ padding: 10, borderRadius: 10, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc' }}>
                  <option>Normal</option>
                  <option>Protect Lead</option>
                  <option>Need Goal</option>
                  <option>Development</option>
                  <option>Pull Back</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>
                Formation
                <select value={nextQuarterFormation} onChange={(e) => { setNextQuarterFormation(e.target.value); setNextQuarterAdvice(null) }} style={{ padding: 10, borderRadius: 10, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc' }}>
                  {getFormationsForFormat(gameFormat).map((formation) => <option key={formation}>{formation}</option>)}
                </select>
              </label>
            </div>

            {formationSituationWarning && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  border: '1px solid #ca8a04',
                  borderRadius: 10,
                  background: 'rgba(234, 179, 8, 0.1)',
                  fontSize: 13,
                  color: '#facc15',
                }}
              >
                <strong>Pull Back Suggestion</strong>
                <div style={{ marginTop: 4, color: '#fef08a' }}>
                  You're protecting a comfortable lead. Consider switching to a more defensive formation before applying this plan.
                </div>
              </div>
            )}

            {!nextQuarterAdvice ? (
              <button onClick={optimizeNextQuarter} disabled={optimizerLoading} style={{ width: '100%', marginTop: 14, minHeight: 48, fontWeight: 700, borderRadius: 10, border: 'none', background: '#0284c7', color: '#fff', cursor: 'pointer' }}>
                {optimizerLoading ? 'LOADING GAME CONTEXT...' : `PREVIEW Q${quarter + 1} PLAN`}
              </button>
            ) : (
              <>
                <div style={{ marginTop: 14, padding: 12, border: '1px solid #334155', borderRadius: 10, background: '#1e293b' }}>
                  <strong style={{ color: '#38bdf8' }}>Q{quarter + 1} - {nextQuarterFormation}</strong>
                  <div style={{ fontSize: 12, marginTop: 4, color: '#94a3b8' }}>
                    {nextQuarterSituation}: {nextQuarterAdvice.message}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginTop: 12, fontSize: 13, color: '#cbd5e1' }}>
                    {nextQuarterAdvice.suggestedLineup.map(({ position, player }) => (
                      <div key={position}><strong style={{ color: '#f8fafc' }}>{positionShort[position] || position}:</strong> #{player.jersey_number ?? '-'} {player.first_name || player.name.split(' ')[0]}</div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 12, fontSize: 13, color: '#cbd5e1' }}>
                  <strong style={{ color: '#f8fafc' }}>Bench:</strong>{' '}
                  {players.filter((player) => !nextQuarterAdvice.suggestedLineup.some(({ player: selected }) => selected.id === player.id))
                    .map((player) => `#${player.jersey_number ?? '-'} ${player.first_name || player.name.split(' ')[0]}`).join(', ') || 'None'}
                </div>

                {nextQuarterAdvice.warnings.length > 0 && (
                  <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'rgba(234, 179, 8, 0.1)', border: '1px solid #ca8a04', fontSize: 12, color: '#facc15' }}>
                    <strong>Rotation notes</strong>
                    {nextQuarterAdvice.warnings.map((warning) => <div key={warning} style={{ marginTop: 4, color: '#fef08a' }}>{warning}</div>)}
                  </div>
                )}

                <button onClick={applyNextQuarterPlan} disabled={saving || !nextQuarterAdvice.canApply} style={{ width: '100%', marginTop: 16, minHeight: 48, fontWeight: 700, borderRadius: 10, border: 'none', background: nextQuarterAdvice.canApply ? '#10b981' : '#475569', color: '#fff', cursor: saving || !nextQuarterAdvice.canApply ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'SAVING...' : nextQuarterAdvice.canApply ? `APPLY Q${quarter + 1} PLAN` : 'NO RULE-COMPLIANT PLAN'}
                </button>
              </>
            )}

            <button onClick={() => { setShowNextQuarterOptimizer(false); setNextQuarterAdvice(null) }} disabled={saving} style={{ width: '100%', marginTop: 8, minHeight: 44, borderRadius: 10, border: '1px solid #334155', background: '#334155', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {canManageGame && showCurrentQuarterOptimizer && gameStatus === 'Live' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', width: '100%', maxWidth: 700, maxHeight: '88vh', overflowY: 'auto', padding: 20, borderRadius: '20px 20px 0 0', boxSizing: 'border-box', boxShadow: '0 -10px 25px rgba(0,0,0,0.5)' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 18, color: '#f8fafc' }}>Optimize Q{quarter} NOW</h2>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>
              Score: {ourGoals}-{theirGoals}. Uses actual live assignments from earlier quarters when available.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>
                Game Situation
                <select value={currentQuarterSituation} onChange={(e) => { setCurrentQuarterSituation(e.target.value as GameSituation); setCurrentQuarterAdvice(null) }} style={{ padding: 10, borderRadius: 10, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc' }}>
                  <option>Normal</option>
                  <option>Protect Lead</option>
                  <option>Need Goal</option>
                  <option>Development</option>
                  <option>Pull Back</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>
                Formation
                <select value={currentQuarterFormation} onChange={(e) => { setCurrentQuarterFormation(e.target.value); setCurrentQuarterAdvice(null) }} style={{ padding: 10, borderRadius: 10, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc' }}>
                  {getFormationsForFormat(gameFormat).map((formation) => <option key={formation}>{formation}</option>)}
                </select>
              </label>
            </div>

            {currentFormationSituationWarning && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  border: '1px solid #ca8a04',
                  borderRadius: 10,
                  background: 'rgba(234, 179, 8, 0.1)',
                  fontSize: 13,
                  color: '#facc15',
                }}
              >
                <strong>Pull Back Suggestion</strong>
                <div style={{ marginTop: 4, color: '#fef08a' }}>
                  You're protecting a comfortable lead. Consider switching to a more defensive formation before applying this plan.
                </div>
              </div>
            )}

            {!currentQuarterAdvice ? (
              <button onClick={optimizeCurrentQuarter} disabled={optimizerLoading} style={{ width: '100%', marginTop: 14, minHeight: 48, fontWeight: 700, borderRadius: 10, border: 'none', background: '#0284c7', color: '#fff', cursor: 'pointer' }}>
                {optimizerLoading ? 'LOADING GAME CONTEXT...' : `PREVIEW Q${quarter} PLAN`}
              </button>
            ) : (
              <>
                <div style={{ marginTop: 14, padding: 12, border: '1px solid #334155', borderRadius: 10, background: '#1e293b' }}>
                  <strong style={{ color: '#38bdf8' }}>Q{quarter} - {currentQuarterFormation}</strong>
                  <div style={{ fontSize: 12, marginTop: 4, color: '#94a3b8' }}>
                    {currentQuarterSituation}: {currentQuarterAdvice.message}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', marginTop: 12, fontSize: 13, color: '#cbd5e1' }}>
                    {currentQuarterAdvice.suggestedLineup.map(({ position, player }) => (
                      <div key={position}><strong style={{ color: '#f8fafc' }}>{positionShort[position] || position}:</strong> #{player.jersey_number ?? '-'} {player.first_name || player.name.split(' ')[0]}</div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 12, fontSize: 13, color: '#cbd5e1' }}>
                  <strong style={{ color: '#f8fafc' }}>Bench:</strong>{' '}
                  {players.filter((player) => !currentQuarterAdvice.suggestedLineup.some(({ player: selected }) => selected.id === player.id))
                    .map((player) => `#${player.jersey_number ?? '-'} ${player.first_name || player.name.split(' ')[0]}`).join(', ') || 'None'}
                </div>

                {currentQuarterAdvice.warnings.length > 0 && (
                  <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'rgba(234, 179, 8, 0.1)', border: '1px solid #ca8a04', fontSize: 12, color: '#facc15' }}>
                    <strong>Rotation notes</strong>
                    {currentQuarterAdvice.warnings.map((warning) => <div key={warning} style={{ marginTop: 4, color: '#fef08a' }}>{warning}</div>)}
                  </div>
                )}

                <button onClick={applyCurrentQuarterPlan} disabled={saving || !currentQuarterAdvice.canApply} style={{ width: '100%', marginTop: 16, minHeight: 48, fontWeight: 700, borderRadius: 10, border: 'none', background: currentQuarterAdvice.canApply ? '#10b981' : '#475569', color: '#fff', cursor: saving || !currentQuarterAdvice.canApply ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'SAVING...' : currentQuarterAdvice.canApply ? `APPLY Q${quarter} PLAN` : 'NO RULE-COMPLIANT PLAN'}
                </button>
              </>
            )}

            <button onClick={() => { setShowCurrentQuarterOptimizer(false); setCurrentQuarterAdvice(null) }} disabled={saving} style={{ width: '100%', marginTop: 8, minHeight: 44, borderRadius: 10, border: '1px solid #334155', background: '#334155', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showShot && (
        <div onClick={() => { setShowShot(false); setShotPlayer('') }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', width: '100%', maxWidth: 700, padding: '20px 20px calc(20px + env(safe-area-inset-bottom))', borderRadius: '20px 20px 0 0', boxSizing: 'border-box', boxShadow: '0 -10px 25px rgba(0,0,0,0.5)' }}>
            <h2 style={{ marginTop: 0, fontSize: 18, color: '#f8fafc' }}>Our Shot - Q{quarter}</h2>
            <p style={{ marginTop: 0, color: '#94a3b8', fontSize: 13 }}>Who took the shot?</p>
            <select value={shotPlayer} onChange={(e) => setShotPlayer(e.target.value)} style={{ width: '100%', padding: 12, marginTop: 8, fontSize: 15, borderRadius: 10, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc' }}>
              <option value="">Select player</option>
              {currentPlayers.map((player) => (
                <option key={player.id} value={player.id}>#{player.jersey_number ?? '-'} {player.first_name || player.name.split(' ')[0]}</option>
              ))}
            </select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
              <button onClick={() => { setShowShot(false); setShotPlayer('') }} style={{ padding: 12, fontSize: 15, borderRadius: 10, border: '1px solid #334155', background: '#334155', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={recordOurShot} disabled={!shotPlayer || saving} style={{ padding: 12, fontSize: 15, borderRadius: 10, border: 'none', background: '#0284c7', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Record Shot</button>
            </div>
          </div>
        </div>
      )}

      {showGoal && (
        <div onClick={() => { setShowGoal(false); setGoalScorer(''); setGoalAssister('') }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#0f172a', border: '1px solid #334155', color: '#f8fafc', width: '100%', maxWidth: 700, padding: '20px 20px calc(20px + env(safe-area-inset-bottom))', borderRadius: '20px 20px 0 0', boxSizing: 'border-box', boxShadow: '0 -10px 25px rgba(0,0,0,0.5)' }}>
            <h2 style={{ marginTop: 0, fontSize: 18, color: '#f8fafc' }}>Our Goal - Q{quarter}</h2>
            <label style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>Scorer</label>
            <select value={goalScorer} onChange={(e) => setGoalScorer(e.target.value)} style={{ width: '100%', padding: 12, marginTop: 6, marginBottom: 12, fontSize: 15, borderRadius: 10, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc' }}>
              <option value="">Select scorer</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>#{player.jersey_number ?? '-'} {player.first_name || player.name.split(' ')[0]}</option>
              ))}
            </select>
            <label style={{ display: 'block', fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>Assist (optional)</label>
            <select value={goalAssister} onChange={(e) => setGoalAssister(e.target.value)} style={{ width: '100%', padding: 12, marginTop: 6, fontSize: 15, borderRadius: 10, border: '1px solid #334155', background: '#1e293b', color: '#f8fafc' }}>
              <option value="">No assist</option>
              {players.filter((player) => player.id !== goalScorer).map((player) => (
                <option key={player.id} value={player.id}>#{player.jersey_number ?? '-'} {player.first_name || player.name.split(' ')[0]}</option>
              ))}
            </select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 18 }}>
              <button onClick={() => { setShowGoal(false); setGoalScorer(''); setGoalAssister('') }} style={{ padding: 12, fontSize: 15, borderRadius: 10, border: '1px solid #334155', background: '#334155', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={recordOurGoal} disabled={!goalScorer || saving} style={{ padding: 12, fontSize: 15, borderRadius: 10, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                Save Goal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}