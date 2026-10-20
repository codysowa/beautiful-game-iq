import { useEffect, useMemo, useState } from 'react'
import './App.css'

import { supabase } from './supabase'
import LiveGame from './LiveGame'
import Monetization from './Monetization'
import { APP_PLATFORM, APP_VERSION } from './appInfo'
import {
  getRotationAdvice as getSharedRotationAdvice,
  optimizationFormations,
  getDefaultFormationForFormat,
  getFormationsForFormat,
  formationRows,
  optimizeWholeGame as getSharedWholeGamePlan,
} from './optimizer'

type Team = {
  id: string
  name: string
  age_group: string
  format: string
  season: string
  archived: boolean
  city: string | null
  coach_name: string | null
  join_code: string | null
  max_gk_quarters: number | null
  max_bench_quarters: number | null
  min_quarters_played: number | null
  target_quarters_played: number | null
  require_everyone_play: boolean | null
  default_formation: string | null
}

type Player = {
  id: string
  team_id: string
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

type Game = {
  id: string
  team_id: string
  opponent: string
  game_date: string
  game_time: string | null
  format: string
  location: string | null
  home_away: string
  status: string
  notes: string | null
  captain_1_id: string | null
  captain_2_id: string | null
}

type AttendanceRecord = {
  status: 'Present' | 'Absent' | 'Late'
  arrival_quarter: number | null
  departure_quarter: number | null
  available_quarters: number[]
}

type GameEvent = {
  id: string
  game_id: string
  event_type: 'our_goal' | 'their_goal' | 'save' | 'our_shot'
  player_id: string | null
  assister_id: string | null
  quarter: number
  created_at: string
}

type LineupItem = {
  player_id: string
  quarter: number
  position: string
}

type PositionSegment = {
  id: string
  game_id: string
  quarter: number
  player_id: string
  position: string
  started_at: string
  ended_at: string | null
}

const TEAM_ID = '92713845-68a3-4bdc-9455-9d93c24744bf'

// Position slots are driven by the selected formation.
// The UI displays the field from attacking end to defending end:
// Strikers at the top, GK at the bottom.
function positionsForFormation(formation: string) {
  return [...(optimizationFormations[formation] || optimizationFormations['3-1-2'])].reverse()
}

function availabilityFromAttendanceRow(row: { status: 'Present' | 'Absent' | 'Late'; arrival_quarter: number | null; departure_quarter: number | null; available_quarters?: number[] | null }) {
  if (Array.isArray(row.available_quarters)) return row.available_quarters.map(Number).filter((q) => q >= 1 && q <= 4)
  if (row.status === 'Absent') return []
  const start = row.status === 'Late' ? (row.arrival_quarter || 2) : 1
  const end = row.departure_quarter || 4
  return [1, 2, 3, 4].filter((q) => q >= start && q <= end)
}

function attendanceSummary(quarters: number[]) {
  const sorted = [...quarters].sort((a, b) => a - b)
  if (sorted.length === 0) return 'Absent all game'
  if (sorted.length === 4) return 'Available all game'
  const expected = Array.from({ length: sorted.length }, (_, i) => sorted[0] + i)
  const contiguous = expected.every((q, i) => q === sorted[i])
  if (contiguous && sorted[0] > 1) return `Arrives Q${sorted[0]}`
  if (contiguous && sorted[sorted.length - 1] < 4) return `Leaves after Q${sorted[sorted.length - 1]}`
  return 'Custom availability'
}

function legacyAttendanceFields(quarters: number[]) {
  const sorted = [...quarters].sort((a, b) => a - b)
  if (sorted.length === 0) return { status: 'Absent' as const, arrival_quarter: null, departure_quarter: null }
  const contiguous = sorted.every((q, i) => q === sorted[0] + i)
  const arrival = contiguous && sorted[0] > 1 ? sorted[0] : null
  const departure = contiguous && sorted[sorted.length - 1] < 4 ? sorted[sorted.length - 1] : null
  return { status: arrival ? 'Late' as const : 'Present' as const, arrival_quarter: arrival, departure_quarter: departure }
}

function inferFormationForLineup(items: LineupItem[], format: string, fallback: string) {
  const positions = new Set(items.map((item) => item.position))
  const match = getFormationsForFormat(format).find((formation) => {
    const slots = optimizationFormations[formation] || []
    return slots.length === items.length && slots.every((slot) => positions.has(slot))
  })
  return match || fallback
}

function positionShort(position: string) {
  const labels: Record<string, string> = {
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
  }

  return labels[position] ?? position
}

function formatGameTime(time: string | null) {
  if (!time) return ''
  const [hours, minutes] = time.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return time
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`
}

function buildGameDateOptions() {
  const start = new Date()
  start.setHours(12, 0, 0, 0)

  return Array.from({ length: 366 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const value = `${year}-${month}-${day}`
    const label = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(date)
    return { value, label }
  })
}

function buildGameTimeOptions() {
  return Array.from({ length: 65 }, (_, index) => {
    const totalMinutes = 6 * 60 + index * 15
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    const hour12 = hours % 12 || 12
    const suffix = hours >= 12 ? 'PM' : 'AM'
    const value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
    const label = `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`
    return { value, label }
  })
}

function localDateInputValue() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const values = new Uint32Array(6)
  crypto.getRandomValues(values)
  return Array.from(values, (value) => chars[value % chars.length]).join('')
}

function App() {
  const [team, setTeam] = useState<Team | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [archivedTeams, setArchivedTeams] = useState<Team[]>([])
  const [archivedViewTeam, setArchivedViewTeam] = useState<Team | null>(null)
  const [archivedViewPlayers, setArchivedViewPlayers] = useState<Player[]>([])
  const [archivedViewGames, setArchivedViewGames] = useState<Game[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState(TEAM_ID)
  const [players, setPlayers] = useState<Player[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [gameEvents, setGameEvents] = useState<GameEvent[]>([])
  const [seasonLineups, setSeasonLineups] = useState<(LineupItem & { game_id: string })[]>([])
  const [actualSeasonLineups, setActualSeasonLineups] = useState<(LineupItem & { game_id: string })[]>([])
  const [positionSegments, setPositionSegments] = useState<PositionSegment[]>([])

  const [screen, setScreen] = useState<
    'home' | 'roster' | 'new-game' | 'lineup' | 'attendance' | 'live-game' | 'games' | 'team-rules' | 'coaches' | 'help'
  >('home')

  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const [selectedQuarter, setSelectedQuarter] = useState(1)
  const [copySourceGameId, setCopySourceGameId] = useState('')
  const [copySourceQuarter, setCopySourceQuarter] = useState(0)

  const [lineup, setLineup] = useState<LineupItem[]>([])
  const [allGameLineups, setAllGameLineups] = useState<LineupItem[]>([])
  const [gameAttendance, setGameAttendance] = useState<Record<string, AttendanceRecord>>({})
  const [captain1Id, setCaptain1Id] = useState('')
  const [captain2Id, setCaptain2Id] = useState('')
  const [selectedPreplanPlayerId, setSelectedPreplanPlayerId] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // /analytics is a direct link to the analytics section of the coach dashboard.
    if (!/^\/(?:admin\/)?analytics\/?$/.test(window.location.pathname)) return
    if (loading) return

    let attempts = 0
    let timer = 0
    const revealAnalytics = () => {
      const analytics = document.querySelector<HTMLElement>('.home-season-analytics')
      if (analytics) {
        analytics.scrollIntoView({ behavior: 'auto', block: 'start' })
        return
      }
      attempts += 1
      if (attempts < 30) timer = window.setTimeout(revealAnalytics, 150)
    }
    timer = window.setTimeout(revealAnalytics, 100)
    return () => window.clearTimeout(timer)
  }, [loading, screen])

  const [savingLineup, setSavingLineup] = useState(false)
  const [changingQuarter, setChangingQuarter] = useState(false)
  const [wholeGameSuggestion, setWholeGameSuggestion] = useState<LineupItem[] | null>(null)
  const [gameSituation, setGameSituation] = useState<'Normal' | 'Protect Lead' | 'Need Goal' | 'Development' | 'Pull Back'>('Normal')
  const [optimizationFormation, setOptimizationFormation] = useState('3-2-1')
  const [defaultFormation, setDefaultFormation] = useState('3-2-1')
  const [quarterSuggestion, setQuarterSuggestion] = useState<ReturnType<typeof getSharedRotationAdvice> | null>(null)

  useEffect(() => {
    if (!selectedGame) return
    setWholeGameSuggestion(null)
    setQuarterSuggestion(null)
  }, [selectedGame?.id])

  const [newPlayerFirstName, setNewPlayerFirstName] = useState('')
  const [newPlayerLastName, setNewPlayerLastName] = useState('')
  const [newPlayerNumber, setNewPlayerNumber] = useState('')
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null)
  const [coachProfilePlayerId, setCoachProfilePlayerId] = useState<string | null>(null)
  const [editingGameId, setEditingGameId] = useState<string | null>(null)

  const [maxGkQuarters, setMaxGkQuarters] = useState('2')
  const [maxBenchQuarters, setMaxBenchQuarters] = useState('2')
  const [targetQuartersPlayed, setTargetQuartersPlayed] = useState('3')
  const [requireEveryonePlay, setRequireEveryonePlay] = useState(true)

  const [opponent, setOpponent] = useState('')
  const [gameDate, setGameDate] = useState(localDateInputValue())
  const [gameTime, setGameTime] = useState('')
  const [location, setLocation] = useState('')
  const [homeAway, setHomeAway] = useState('Home')
  const [gameNotes, setGameNotes] = useState('')
  const [showNewTeamForm, setShowNewTeamForm] = useState(false)
  const [showNewUserOnboarding, setShowNewUserOnboarding] = useState(false)
  const [helpStep, setHelpStep] = useState(0)
  const [helpReturnScreen, setHelpReturnScreen] = useState<'home' | 'roster' | 'new-game' | 'lineup' | 'attendance' | 'live-game' | 'games' | 'team-rules' | 'coaches' | 'help'>('home')
  const [showJoinTeam, setShowJoinTeam] = useState(false)
  const [showArchivedTeams, setShowArchivedTeams] = useState(false)
  const [joinTeamSearch, setJoinTeamSearch] = useState('')
  const [joinTeamResults, setJoinTeamResults] = useState<Team[]>([])
  const [joinRequestTeamIds, setJoinRequestTeamIds] = useState<string[]>([])
  const [joinRequests, setJoinRequests] = useState<Array<{ id: string; team_id: string; user_id: string; status: 'pending' | 'approved' | 'denied'; created_at: string; full_name: string; email: string }>>([])
  const [analyticsSort, setAnalyticsSort] = useState<'player' | 'played' | 'gk' | 'str' | 'bench' | 'goals' | 'assists' | 'shots' | 'saves' | 'captain'>('player')
  const [analyticsSortAsc, setAnalyticsSortAsc] = useState(true)
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamCity, setNewTeamCity] = useState('')
  const [newTeamCoachName, setNewTeamCoachName] = useState('')
  const [joinCodeSearch, setJoinCodeSearch] = useState('')
  const [newTeamAgeGroup, setNewTeamAgeGroup] = useState('U10')
  const [newTeamFormat, setNewTeamFormat] = useState('7v7')
  const [newTeamSeasonType, setNewTeamSeasonType] = useState('Fall')
  const [newTeamSeasonYear, setNewTeamSeasonYear] = useState('2026')
  const [staff, setStaff] = useState<Array<{ user_id: string; role: 'owner' | 'coach' | 'viewer'; is_head_coach: boolean; full_name: string; email: string }>>([])
  const [currentUserName, setCurrentUserName] = useState('')
  const [currentUserEmail, setCurrentUserEmail] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<'owner' | 'coach' | 'viewer' | null>(null)
  const [coachDraft, setCoachDraft] = useState<{ playerId: string; usage_priority: NonNullable<Player['usage_priority']>; bench_tolerance: NonNullable<Player['bench_tolerance']>; position_preferences: Record<string, number>; avoid_positions: string[]; coach_notes: string } | null>(null)
  const [bugReportOpen, setBugReportOpen] = useState(false)
  const [bugReport, setBugReport] = useState({ severity: 'Normal', summary: '', details: '' })

  useEffect(() => {
    loadApp(selectedTeamId)
  }, [selectedTeamId])

  async function signOut() {
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error(error)
      alert(`Could not sign out: ${error.message}`)
    }
  }

  async function deleteAccount() {
    if (deletingAccount) return

    const confirmed = confirm(
      'Delete your Beautiful Game IQ account? This will permanently delete your account and personal data. Any team you own will be transferred to an existing coach so the team data can be preserved. This cannot be undone.'
    )

    if (!confirmed) return

    setDeletingAccount(true)

    try {
      const { data, error } = await supabase.functions.invoke('delete-account')

      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'Account deletion failed')

      await supabase.auth.signOut()
    } catch (error) {
      console.error(error)
      alert(`Could not delete your account: ${error instanceof Error ? error.message : 'Unexpected error'}`)
      setDeletingAccount(false)
    }
  }

  async function updateStaffRole(member: { user_id: string; role: 'owner' | 'coach' | 'viewer'; full_name: string; email: string }, role: 'coach' | 'viewer') {
    if (currentUserRole !== 'owner' || member.user_id === (await supabase.auth.getUser()).data.user?.id) return

    const { error } = await supabase
      .from('team_members')
      .update({ role })
      .eq('team_id', selectedTeamId)
      .eq('user_id', member.user_id)

    if (error) {
      console.error(error)
      alert(`Could not change ${member.full_name}'s role: ${error.message}`)
      return
    }

    await loadApp(selectedTeamId)
  }

  async function setHeadCoach(member: { user_id: string; role: 'owner' | 'coach' | 'viewer'; is_head_coach: boolean; full_name: string; email: string }, makeHeadCoach: boolean) {
    if (currentUserRole !== 'owner' || member.role === 'viewer') return

    if (makeHeadCoach) {
      const { error: clearError } = await supabase
        .from('team_members')
        .update({ is_head_coach: false })
        .eq('team_id', selectedTeamId)

      if (clearError) {
        console.error(clearError)
        alert(`Could not update Head Coach: ${clearError.message}`)
        return
      }
    }

    const { error: setError } = await supabase
      .from('team_members')
      .update({ is_head_coach: makeHeadCoach })
      .eq('team_id', selectedTeamId)
      .eq('user_id', member.user_id)

    if (setError) {
      console.error(setError)
      alert(`Could not update ${member.full_name} as Head Coach: ${setError.message}`)
      return
    }

    await loadApp(selectedTeamId)
  }
  async function removeStaffMember(member: { user_id: string; role: 'owner' | 'coach' | 'viewer'; full_name: string; email: string }) {
    if (currentUserRole !== 'owner' || member.role === 'owner') return
    if (!confirm(`Remove ${member.full_name} from ${team?.name || 'this team'}? They will lose access to the team.`)) return

    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', selectedTeamId)
      .eq('user_id', member.user_id)

    if (error) {
      console.error(error)
      alert(`Could not remove ${member.full_name}: ${error.message}`)
      return
    }

    setStaff((current) => current.filter((item) => item.user_id !== member.user_id))
  }

  async function leaveTeam() {
    if (currentUserRole === 'owner') {
      alert('Team owners cannot leave their own team. Transfer ownership before leaving.')
      return
    }

    if (!selectedTeamId || !team) return

    if (!confirm(`Leave ${team.name}? You will lose access to this team and its games, roster, and coaching tools.`)) return

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user?.id) {
      console.error(userError)
      alert(`Could not identify the signed-in user: ${userError?.message || 'Unknown error'}`)
      return
    }

    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', selectedTeamId)
      .eq('user_id', user.id)

    if (error) {
      console.error(error)
      alert(`Could not leave ${team.name}: ${error.message}`)
      return
    }

    setShowJoinTeam(false)
    setJoinTeamResults([])
    setJoinTeamSearch('')
    setJoinCodeSearch('')
    setScreen('home')
    await loadApp(selectedTeamId)
  }

  async function loadApp(teamId = selectedTeamId, showLoading = true) {
    if (showLoading) setLoading(true)

    const { data: membershipData, error: membershipError } = await supabase
      .from('team_members')
      .select('team_id, role, user_id, is_head_coach')

    if (membershipError) {
      console.error(membershipError)
      alert(`Could not load your team access: ${membershipError.message}`)
      if (showLoading) setLoading(false)
      return
    }

    const memberships = membershipData || []
    const accessibleTeamIds = memberships.map((membership) => membership.team_id)
    const { data: accessibleTeamsForSelection, error: accessibleTeamsSelectionError } = accessibleTeamIds.length > 0
      ? await supabase
          .from('teams')
          .select('*')
          .in('id', accessibleTeamIds)
          .eq('archived', false)
          .order('name', { ascending: true })
      : { data: [], error: null }

    if (accessibleTeamsSelectionError) {
      console.error(accessibleTeamsSelectionError)
      alert(`Could not load your teams: ${accessibleTeamsSelectionError.message}`)
      if (showLoading) setLoading(false)
      return
    }

    const activeTeamIds = (accessibleTeamsForSelection || []).map((availableTeam) => availableTeam.id)
    const archivedTeamIds = accessibleTeamIds.filter((teamId) => !(activeTeamIds.includes(teamId)))
    const { data: archivedTeamsData } = archivedTeamIds.length > 0
      ? await supabase.from('teams').select('*').in('id', archivedTeamIds).order('name', { ascending: true })
      : { data: [] }

    setArchivedTeams(archivedTeamsData || [])


    if (activeTeamIds.length === 0) {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserEmail(user?.email || '')
      setCurrentUserName(user?.user_metadata?.display_name || user?.user_metadata?.full_name || '')
      setCurrentUserId(user?.id || '')
      setCurrentUserRole(memberships.find((membership) => membership.role === 'owner')?.role || memberships[0]?.role || null)
      setTeams([])
      setTeam(null)
      setPlayers([])
      setGames([])
      setGameEvents([])
      setSeasonLineups([])
      setShowNewUserOnboarding(true)
      if (showLoading) setLoading(false)
      return
    }

    setShowNewUserOnboarding(false)

    const activeTeamId = activeTeamIds.includes(teamId)
      ? teamId
      : activeTeamIds[0]

    if (activeTeamId !== selectedTeamId) {
      setSelectedTeamId(activeTeamId)
      return
    }

    const [{ data: teamData }, { data: playerData }, { data: gameData }, { data: accessibleTeams }] =
      await Promise.all([
        supabase.from('teams').select('*').eq('id', activeTeamId).single(),
        supabase.from('players').select('*').eq('team_id', activeTeamId)
          .order('jersey_number', { ascending: true, nullsFirst: false }),
        supabase.from('games').select('*').eq('team_id', activeTeamId).order('game_date', { ascending: true }),
        supabase.from('teams').select('*').in('id', accessibleTeamIds).eq('archived', false).order('name', { ascending: true }),
      ])

    const loadedGames = gameData || []
    const gameIds = loadedGames.map((game) => game.id)

    const [
      { data: eventData, error: eventError },
      { data: lineupData, error: lineupError },
      { data: actualLineupData, error: actualLineupError },
      { data: positionSegmentData, error: positionSegmentError },
    ] = gameIds.length > 0
      ? await Promise.all([
          supabase
            .from('game_events')
            .select('*')
            .in('game_id', gameIds)
            .order('created_at', { ascending: true }),
          supabase
            .from('game_lineups')
            .select('player_id, quarter, position, game_id')
            .in('game_id', gameIds),
          supabase
            .from('game_live_lineups')
            .select('player_id, quarter, position, game_id')
            .in('game_id', gameIds),
          supabase
            .from('game_position_segments')
            .select('id, game_id, quarter, player_id, position, started_at, ended_at')
            .in('game_id', gameIds),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ]

    if (eventError) console.error(eventError)
    if (lineupError) console.error(lineupError)
    if (actualLineupError) console.error(actualLineupError)
    if (positionSegmentError) console.error(positionSegmentError)

    const { data: { user } } = await supabase.auth.getUser()
    const currentUserNameFromAuth =
      user?.user_metadata?.display_name ||
      user?.user_metadata?.full_name ||
      ''
    setCurrentUserEmail(user?.email || '')

    if (user?.id) {
      const { error: profileUpsertError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: user.id,
            full_name: currentUserNameFromAuth || null,
            email: user.email || null,
          },
          { onConflict: 'id' }
        )

      if (profileUpsertError) {
        console.error('Could not sync current coach profile:', profileUpsertError)
      }
    }

    const teamMemberships = memberships.filter(
      (membership) => membership.team_id === activeTeamId
    )
    const staffUserIds = teamMemberships.map((membership) => membership.user_id)
    const { data: profileData, error: profileError } =
      staffUserIds.length > 0
        ? await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', staffUserIds)
        : { data: [], error: null }

    if (profileError) {
      console.error('Could not load staff profiles:', profileError)
    }

    const profileMap = new Map(
      (profileData || []).map((profile) => [profile.id, profile])
    )

    setTeams((accessibleTeams || []) as Team[])
    setStaff(
      teamMemberships.map((membership) => {
        const profile = profileMap.get(membership.user_id)
        const isCurrentUser = membership.user_id === user?.id
        return {
          user_id: membership.user_id,
          role: membership.role as 'owner' | 'coach' | 'viewer',
          is_head_coach: membership.is_head_coach === true,
          full_name:
            profile?.full_name ||
            (isCurrentUser ? currentUserNameFromAuth : '') ||
            'Team Member',
          email: profile?.email || (isCurrentUser ? user?.email || '' : ''),
        }
      })
    )
    setCurrentUserName(currentUserNameFromAuth)
    setCurrentUserEmail(user?.email || '')
    setCurrentUserId(user?.id || '')
    setCurrentUserRole((teamMemberships.find((membership) => membership.user_id === user?.id)?.role as 'owner' | 'coach' | 'viewer' | undefined) || null)
    setTeam(teamData)
    if (teamData) {
      setMaxGkQuarters(String(teamData.max_gk_quarters ?? 2))
      setMaxBenchQuarters(String(teamData.max_bench_quarters ?? 2))
      setTargetQuartersPlayed(String(teamData.target_quarters_played ?? 3))
      setRequireEveryonePlay(teamData.require_everyone_play ?? true)
      const teamDefault = teamData.default_formation || getDefaultFormationForFormat(teamData.format)
      setDefaultFormation(getFormationsForFormat(teamData.format).includes(teamDefault) ? teamDefault : getDefaultFormationForFormat(teamData.format))
    }
    setPlayers((playerData || []).sort((a, b) => (a.jersey_number ?? Number.MAX_SAFE_INTEGER) - (b.jersey_number ?? Number.MAX_SAFE_INTEGER)))
    setGames(loadedGames)
    setGameEvents((eventData || []) as GameEvent[])
    setSeasonLineups((lineupData || []) as (LineupItem & { game_id: string })[])
    setActualSeasonLineups((actualLineupData || []) as (LineupItem & { game_id: string })[])
    setPositionSegments((positionSegmentData || []) as PositionSegment[])
    if (showLoading) setLoading(false)
  }

  async function viewArchivedTeam(archivedTeam: Team) {
    setLoading(true)

    const [{ data: playerData, error: playerError }, { data: gameData, error: gameError }] =
      await Promise.all([
        supabase
          .from('players')
          .select('*')
          .eq('team_id', archivedTeam.id)
          .order('jersey_number', { ascending: true, nullsFirst: false }),
        supabase
          .from('games')
          .select('*')
          .eq('team_id', archivedTeam.id)
          .order('game_date', { ascending: true }),
      ])

    if (playerError || gameError) {
      console.error(playerError || gameError)
      alert(`Could not load archived season: ${(playerError || gameError)?.message || 'Unknown error'}`)
      setLoading(false)
      return
    }

    const archivedGameIds = (gameData || []).map((game) => game.id)
    const { data: archivedEventData, error: archivedEventError } = archivedGameIds.length > 0
      ? await supabase
          .from('game_events')
          .select('*')
          .in('game_id', archivedGameIds)
          .order('created_at', { ascending: true })
      : { data: [], error: null }

    if (archivedEventError) {
      console.error(archivedEventError)
      alert(`Could not load archived game results: ${archivedEventError.message}`)
      setLoading(false)
      return
    }

    setArchivedViewTeam(archivedTeam)
    setArchivedViewPlayers(playerData || [])
    setArchivedViewGames(gameData || [])
    setGameEvents((archivedEventData || []) as GameEvent[])
    setShowNewUserOnboarding(false)
    setLoading(false)
  }
  async function createTeam() {
    const name = newTeamName.trim()
    const city = newTeamCity.trim()
    const coachName = newTeamCoachName.trim()

    if (!name) {
      alert('Enter a team name.')
      return
    }

    if (!city) {
      alert('Enter the team city.')
      return
    }

    if (!coachName) {
      alert('Enter the coach name.')
      return
    }

    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id

    if (!userId) {
      alert('Your session expired. Please sign in again.')
      return
    }

    const { data, error } = await supabase
      .from('teams')
      .insert({
        created_by: userId,
        owner_id: userId,
        name,
        city,
        coach_name: coachName,
        join_code: generateJoinCode(),
        age_group: newTeamAgeGroup,
        format: newTeamFormat,
        season: `${newTeamSeasonType} ${newTeamSeasonYear}`.trim(),
        max_gk_quarters: 2,
        max_bench_quarters: 2,
        min_quarters_played: 0,
        target_quarters_played: 3,
        require_everyone_play: true,
        default_formation: getDefaultFormationForFormat(newTeamFormat),
      })
      .select('*')
      .single()

    if (error) {
      console.error(error)
      alert(`Could not create team: ${error.message}`)
      return
    }

    const { error: membershipInsertError } = await supabase
      .from('team_members')
      .insert({
        team_id: data.id,
        user_id: userId,
        role: 'owner',
        is_head_coach: true,
      })

    if (membershipInsertError) {
      console.error(membershipInsertError)
      alert(`Team was created, but owner access could not be added: ${membershipInsertError.message}`)
      return
    }

    setNewTeamName('')
    setNewTeamCity('')
    setNewTeamCoachName('')
    setShowNewTeamForm(false)
    setSelectedTeamId(data.id)
  }

  async function saveTeamRules() {
    const payload = {
      max_gk_quarters: Number(maxGkQuarters),
      max_bench_quarters: Number(maxBenchQuarters),
        target_quarters_played: Number(targetQuartersPlayed),
      require_everyone_play: requireEveryonePlay,
      default_formation: defaultFormation,
    }

    if (Object.values(payload).some((value) => typeof value === 'number' && (Number.isNaN(value) || value < 0))) {
      alert('Enter valid non-negative rule values.')
      return
    }

    const { error } = await supabase
      .from('teams')
      .update(payload)
      .eq('id', selectedTeamId)

    if (error) {
      console.error(error)
      alert(`Could not save Team Rules: ${error.message}`)
      return
    }

    await loadApp()
    alert('Team Rules saved.')
  }

  async function toggleTeamArchived() {
    if (currentUserRole !== 'owner' || !team) return

    const nextArchived = !team.archived
    const action = nextArchived ? 'archive' : 'unarchive'

    if (!window.confirm(`Are you sure you want to ${action} ${team.name}?`)) return

    const { error } = await supabase
      .from('teams')
      .update({ archived: nextArchived })
      .eq('id', team.id)

    if (error) {
      console.error(error)
      alert(`Could not ${action} team: ${error.message}`)
      return
    }

    await loadApp()
    alert(nextArchived ? 'Team archived.' : 'Team unarchived.')
  }
  async function addOrUpdatePlayer() {
    const firstName = newPlayerFirstName.trim()
    const lastName = newPlayerLastName.trim()
    const name = [firstName, lastName].filter(Boolean).join(' ')
    if (!firstName) { alert('Enter a first name.'); return }
    const jerseyNumber = newPlayerNumber ? Number(newPlayerNumber) : null
    const payload = { name, first_name: firstName, last_name: lastName || null, jersey_number: jerseyNumber }
    const result = editingPlayerId
      ? await supabase.from('players').update(payload).eq('id', editingPlayerId)
      : await supabase.from('players').insert({ team_id: selectedTeamId, ...payload })
    if (result.error) { console.error(result.error); alert(editingPlayerId ? 'Could not update player.' : 'Could not add player.'); return }
    setNewPlayerFirstName(''); setNewPlayerLastName(''); setNewPlayerNumber(''); setEditingPlayerId(null)
    await loadApp()
  }

  function editPlayer(player: Player) {
    setEditingPlayerId(player.id)
    setNewPlayerFirstName(player.first_name || player.name.split(' ')[0] || '')
    setNewPlayerLastName(player.last_name || player.name.split(' ').slice(1).join(' '))
    setNewPlayerNumber(player.jersey_number === null ? '' : String(player.jersey_number))
  }

  async function saveCoachProfile(player: Player, profile: {
    usage_priority: NonNullable<Player['usage_priority']>
    bench_tolerance: NonNullable<Player['bench_tolerance']>
    position_preferences: Record<string, number>
    avoid_positions: string[]
    coach_notes: string
  }) {
    const { error } = await supabase
      .from('players')
      .update(profile)
      .eq('id', player.id)

    if (error) {
      console.error(error)
      alert(`Could not save Coach Knowledge: ${error.message}`)
      return
    }

    setCoachProfilePlayerId(null)
    await loadApp()
  }

  async function deletePlayer(player: Player) {
    if (!confirm(`Delete ${player.name}?`)) return

    const { error } = await supabase
      .from('players')
      .delete()
      .eq('id', player.id)

    if (error) {
      console.error(error)
      alert('Could not delete player.')
      return
    }

    await loadApp()
  }

  async function resetGame(game: Game) {
    if (!confirm(
      `Reset the game vs. ${game.opponent}?\n\n` +
        'This will remove all game activity: goals/events, live lineups, saved quarter lineups, and attendance. ' +
        'The game itself will remain scheduled, with captains cleared. All players will default back to Present.'
    )) {
      return
    }

    const gameId = game.id

    const [eventsResult, liveLineupsResult, lineupsResult, attendanceResult, positionSegmentsResult] = await Promise.all([
      supabase.from('game_events').delete().eq('game_id', gameId),
      supabase.from('game_live_lineups').delete().eq('game_id', gameId),
      supabase.from('game_lineups').delete().eq('game_id', gameId),
      supabase.from('game_attendance').delete().eq('game_id', gameId),
      supabase.from('game_position_segments').delete().eq('game_id', gameId),
    ])

    const firstError =
      eventsResult.error ||
      liveLineupsResult.error ||
      lineupsResult.error ||
      attendanceResult.error ||
      positionSegmentsResult.error

    if (firstError) {
      console.error(firstError)
      alert(`Could not fully reset the game: ${firstError.message}`)
      return
    }

    const { error: gameError } = await supabase
      .from('games')
      .update({
        status: 'Scheduled',
        captain_1_id: null,
        captain_2_id: null,
      })
      .eq('id', gameId)

    if (gameError) {
      console.error(gameError)
      alert(`Game activity was cleared, but the game could not be returned to Scheduled: ${gameError.message}`)
      await loadApp()
      return
    }

    await loadApp()
    alert('Game reset. It is back to Scheduled with a clean slate.')
  }

  function startEditGame(game: Game) {
    setEditingGameId(game.id)
    setOpponent(game.opponent)
    setGameDate(game.game_date)
    setGameTime(game.game_time || '')
    setLocation(game.location || '')
    setHomeAway(game.home_away)
    setGameNotes(game.notes || '')
    setScreen('new-game')
  }

  async function updateGame() {
    if (!editingGameId) return

    if (!opponent.trim()) {
      alert('Enter an opponent.')
      return
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(gameDate)) {
      alert('Choose a valid game date.')
      return
    }

    const { data, error } = await supabase
      .from('games')
      .update({
        opponent: opponent.trim(),
        game_date: gameDate,
        game_time: gameTime || null,
        location: location.trim() || null,
        home_away: homeAway,
        notes: gameNotes.trim() || null,
      })
      .eq('id', editingGameId)
      .select()
      .single()

    if (error) {
      console.error(error)
      alert('Could not update game.')
      return
    }

    setGames((current) =>
      current.map((game) => (game.id === editingGameId ? data : game))
    )
    setSelectedGame((current) => (current?.id === editingGameId ? data : current))

    setEditingGameId(null)
    setOpponent('')
    setGameDate(localDateInputValue())
    setGameTime('')
    setLocation('')
    setHomeAway('Home')
    setGameNotes('')
    setScreen('games')
  }

  async function createGame() {
    if (!opponent.trim()) {
      alert('Enter an opponent.')
      return
    }

    const normalizedDate = gameDate
    const normalizedTime = gameTime || null

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      alert('Choose a valid game date.')
      return
    }

    const { data, error } = await supabase
      .from('games')
      .insert({
        team_id: selectedTeamId,
        opponent: opponent.trim(),
        game_date: normalizedDate,
        game_time: normalizedTime,
        format: team?.format || '7v7',
        location: location.trim() || null,
        home_away: homeAway,
        status: 'Scheduled',
        notes: gameNotes.trim() || null,
      })
      .select()
      .single()

    if (error) {
      console.error(error)
      alert('Could not create game.')
      return
    }

    setEditingGameId(null)
    setOpponent('')
    const resetDate = localDateInputValue()
    setGameDate(resetDate)
    setGameTime('')
    setLocation('')
    setHomeAway('Home')
    setGameNotes('')

    await loadApp()

    if (data) {
      openLineup(data)
    }
  }

  async function openLineup(game: Game) {
    setSelectedGame(game)
    setSelectedQuarter(1)
    setCopySourceGameId('')
    setCopySourceQuarter(0)
    setCaptain1Id(game.captain_1_id || '')
    setCaptain2Id(game.captain_2_id || '')

    const [{ data: attendanceData, error: attendanceError }, { data, error }] = await Promise.all([
      supabase
        .from('game_attendance')
        .select('player_id, status, arrival_quarter, departure_quarter, available_quarters')
        .eq('game_id', game.id),
      supabase
        .from('game_lineups')
        .select('*')
        .eq('game_id', game.id),
    ])

    if (attendanceError) {
      console.error(attendanceError)
      alert('Could not load attendance.')
      return
    }

    if (error) {
      console.error(error)
      alert('Could not load lineup.')
      return
    }

    const attendanceMap: Record<string, AttendanceRecord> = {}

    for (const row of attendanceData || []) {
      attendanceMap[row.player_id] = {
        status: row.status,
        arrival_quarter: row.arrival_quarter,
        departure_quarter: row.departure_quarter ?? null,
        available_quarters: availabilityFromAttendanceRow(row),
      }
    }

    for (const player of players) {
      if (!attendanceMap[player.id]) {
        attendanceMap[player.id] = {
          status: 'Present',
          arrival_quarter: null,
          departure_quarter: null,
          available_quarters: [1, 2, 3, 4],
        }
      }
    }

    setGameAttendance(attendanceMap)

    const loaded = data || []

    setAllGameLineups(loaded)

    const q1Lineup = loaded
      .filter((item) => item.quarter === 1)
      .map((item) => ({
        player_id: item.player_id,
        quarter: item.quarter,
        position: item.position,
      }))

    setLineup(q1Lineup)
    const fallbackFormation = team?.default_formation || getDefaultFormationForFormat(game.format)
    setOptimizationFormation(inferFormationForLineup(q1Lineup, game.format, fallbackFormation))

    setScreen('lineup')
  }

  async function changeQuarter(quarter: number) {
    if (!selectedGame || quarter === selectedQuarter || changingQuarter || savingLineup) return

    setChangingQuarter(true)
    try {
      // Auto-save the quarter being edited before switching away from it.
      // Lock quarter navigation while this save/load sequence is in progress so
      // repeated taps cannot start overlapping delete/insert operations.
      if (currentUserRole === 'owner' || currentUserRole === 'coach') {
        const saved = await saveLineupData(lineup, selectedQuarter, false)
        if (!saved) return
      }

      const { data, error } = await supabase
        .from('game_lineups')
        .select('*')
        .eq('game_id', selectedGame.id)
        .eq('quarter', quarter)

      if (error) {
        console.error(error)
        alert('Could not load that quarter.')
        return
      }

      const nextLineup = data || []

      setSelectedQuarter(quarter)
      setLineup(nextLineup)

      setAllGameLineups((current) => [
        ...current.filter((item) => item.quarter !== quarter),
        ...nextLineup,
      ])
    } finally {
      setChangingQuarter(false)
    }
  }

  async function copyQuarterFromCurrentGame(sourceQuarter: number) {
    if (!selectedGame || sourceQuarter === selectedQuarter) return

    const sourceLineup = allGameLineups
      .filter((item) => item.quarter === sourceQuarter)
      .map((item) => ({
        player_id: item.player_id,
        quarter: selectedQuarter,
        position: item.position,
      }))

    if (sourceLineup.length === 0) {
      alert(`Q${sourceQuarter} has no saved lineup to copy.`)
      return
    }

    const unavailablePlayers = sourceLineup
      .filter((item) => !playerAvailableForQuarter(item.player_id, selectedQuarter))
      .map((item) => playerName(item.player_id))

    if (unavailablePlayers.length > 0) {
      alert(`Cannot copy to Q${selectedQuarter}. These players are not available: ${unavailablePlayers.join(', ')}`)
      return
    }

    const invalidGoalkeepers = sourceLineup
      .filter((item) => item.position === 'Goalkeeper')
      .filter((item) => {
        const existingCount = allGameLineups.filter(
          (row) =>
            row.player_id === item.player_id &&
            row.position === 'Goalkeeper' &&
            row.quarter !== sourceQuarter &&
            row.quarter !== selectedQuarter
        ).length
        return existingCount >= 2
      })
      .map((item) => playerName(item.player_id))

    if (invalidGoalkeepers.length > 0) {
      alert(`Cannot copy to Q${selectedQuarter}. These players would exceed the 2-quarter goalkeeper limit: ${invalidGoalkeepers.join(', ')}`)
      return
    }

    const confirmed = window.confirm(`Replace Q${selectedQuarter} with the Q${sourceQuarter} lineup?`)
    if (!confirmed) return

    setSavingLineup(true)
    try {
      const saved = await saveLineupData(sourceLineup, selectedQuarter, false)
      if (!saved) return

      setLineup(sourceLineup)
      setAllGameLineups((current) => [
        ...current.filter((item) => item.quarter !== selectedQuarter),
        ...sourceLineup,
      ])
      setCopySourceQuarter(0)
      alert(`Q${sourceQuarter} lineup copied to Q${selectedQuarter}.`)
    } finally {
      setSavingLineup(false)
    }
  }

  function previousGamesForCopy() {
    if (!selectedGame) return []
    return games
      .filter((game) => game.id !== selectedGame.id && game.game_date <= selectedGame.game_date)
      .sort((a, b) => {
        const dateCompare = b.game_date.localeCompare(a.game_date)
        if (dateCompare !== 0) return dateCompare
        return (b.game_time || '').localeCompare(a.game_time || '')
      })
  }

  async function copyEntireGameFromGame() {
    if (!selectedGame || !copySourceGameId) {
      alert('Select a previous game first.')
      return
    }

    const sourceGame = games.find((game) => game.id === copySourceGameId)
    if (!sourceGame) return

    const { data, error } = await supabase
      .from('game_lineups')
      .select('player_id, quarter, position')
      .eq('game_id', sourceGame.id)
      .order('quarter', { ascending: true })

    if (error) {
      console.error(error)
      alert('Could not load the saved lineups from ' + sourceGame.opponent + ': ' + error.message)
      return
    }

    const sourceLineup = data || []
    if (sourceLineup.length === 0) {
      alert('There are no saved lineups in the selected game.')
      return
    }

    const missingPlayers = sourceLineup.filter((item) => !players.some((player) => player.id === item.player_id))
    const copiedLineup = sourceLineup
      .filter((item) => players.some((player) => player.id === item.player_id))
      .map((item) => ({
        player_id: item.player_id,
        quarter: item.quarter,
        position: item.position,
      }))

    if (copiedLineup.length === 0) {
      alert('None of the players in that game are on the current roster.')
      return
    }

    if (missingPlayers.length > 0) {
      const confirmed = window.confirm(
        missingPlayers.length + ' player assignment(s) are from players no longer on this roster. Copy the remaining assignments?'
      )
      if (!confirmed) return
    }

    const confirmed = window.confirm(
      'Copy the entire four-quarter lineup from ' + sourceGame.opponent + ' into this game? This will replace all saved Q1-Q4 lineups.'
    )
    if (!confirmed) return

    setSavingLineup(true)
    try {
      const { error: deleteError } = await supabase
        .from('game_lineups')
        .delete()
        .eq('game_id', selectedGame.id)

      if (deleteError) {
        console.error(deleteError)
        alert('Could not replace the game plan: ' + deleteError.message)
        return
      }

      const { error: insertError } = await supabase
        .from('game_lineups')
        .insert(copiedLineup.map((item) => ({
          game_id: selectedGame.id,
          quarter: item.quarter,
          player_id: item.player_id,
          position: item.position,
        })))

      if (insertError) {
        console.error(insertError)
        alert('Could not copy the game plan: ' + insertError.message)
        return
      }

      setAllGameLineups(copiedLineup)
      setLineup(copiedLineup.filter((item) => item.quarter === selectedQuarter))
      setWholeGameSuggestion(null)
      setQuarterSuggestion(null)
      alert('Entire lineup copied from ' + sourceGame.opponent + '.')
    } finally {
      setSavingLineup(false)
    }
  }

  async function saveAttendanceAvailability(playerId: string, availableQuarters: number[]) {
    if (!selectedGame) return

    const normalized = [...new Set(availableQuarters)].filter((q) => q >= 1 && q <= 4).sort((a, b) => a - b)
    const legacy = legacyAttendanceFields(normalized)
    const { error } = await supabase.from('game_attendance').upsert({
      game_id: selectedGame.id,
      player_id: playerId,
      status: legacy.status,
      arrival_quarter: legacy.arrival_quarter,
      departure_quarter: legacy.departure_quarter,
      available_quarters: normalized,
    }, { onConflict: 'game_id,player_id' })

    if (error) {
      console.error(error)
      alert('Could not save attendance.')
      return
    }

    const nextAttendance: AttendanceRecord = {
      ...legacy,
      available_quarters: normalized,
    }
    setGameAttendance((current) => ({ ...current, [playerId]: nextAttendance }))

    const unavailableQuarters = [1, 2, 3, 4].filter((quarter) => !normalized.includes(quarter))

    if (unavailableQuarters.length > 0) {
      const { error: lineupDeleteError } = await supabase
        .from('game_lineups')
        .delete()
        .eq('game_id', selectedGame.id)
        .eq('player_id', playerId)
        .in('quarter', unavailableQuarters)

      if (lineupDeleteError) {
        console.error(lineupDeleteError)
        alert('Could not remove the player from unavailable quarters: ' + lineupDeleteError.message)
        return
      }
    }

    setLineup((current) =>
      current.filter(
        (item) => item.player_id !== playerId || normalized.includes(item.quarter)
      )
    )
    setAllGameLineups((current) =>
      current.filter(
        (item) => item.player_id !== playerId || normalized.includes(item.quarter)
      )
    )
    setQuarterSuggestion(null)
    setWholeGameSuggestion(null)
  }

  function goalkeeperQuarterCount(playerId: string) {
    return allGameLineups.filter(
      (item) =>
        item.player_id === playerId &&
        item.position === 'Goalkeeper' &&
        item.quarter !== selectedQuarter
    ).length
  }

  function playerAvailableForQuarter(playerId: string, quarter: number) {
    const attendance = gameAttendance[playerId]

    if (!attendance) return true
    return attendance.available_quarters.includes(quarter)
  }

  function assignPlayer(playerId: string, position: string) {
    if (!playerAvailableForQuarter(playerId, selectedQuarter)) {

      alert(`${playerName(playerId)} is not marked available for Q${selectedQuarter}.`)

      return
    }
    if (
      position === 'Goalkeeper' &&
      goalkeeperQuarterCount(playerId) >= 2
    ) {
      alert(
        `${playerName(playerId)} has already played 2 goalkeeper quarters.`
      )
      return
    }

    setLineup((current) => {
      const withoutPlayer = current.filter(
        (item) => item.player_id !== playerId
      )

      const withoutPosition = withoutPlayer.filter(
        (item) => item.position !== position
      )

      return [
        ...withoutPosition,
        {
          player_id: playerId,
          quarter: selectedQuarter,
          position,
        },
      ]
    })
  }

  function removePlayerFromPosition(position: string) {
    setLineup((current) =>
      current.filter((item) => item.position !== position)
    )
  }

function playerName(playerId: string) {
  return (
    players.find((player) => player.id === playerId)?.name || 'Unknown'
  )
}


function playerAtPosition(position: string) {
    return lineup.find((item) => item.position === position)
  }

  function playerQuarterAssignment(
    playerId: string,
    quarter: number
  ) {
    return allGameLineups.find(
      (item) =>
        item.player_id === playerId &&
        item.quarter === quarter
    )
  }

  function quarterHasLineup(quarter: number) {
    return allGameLineups.some(
      (item) => item.quarter === quarter
    )
  }

  function playerQuartersPlayed(playerId: string) {
    const quarters = new Set(
      allGameLineups
        .filter((item) => item.player_id === playerId)
        .map((item) => item.quarter)
    )

    return quarters.size
  }

  function rotationAdvice() {
    return getSharedRotationAdvice({
      players,
      teamRules: team,
      attendance: gameAttendance,
      plannedLineups: allGameLineups,
      gameSituation,
      formation: optimizationFormation,
      quarter: selectedQuarter,
    })

  }

  function rotationWarnings() {
    const maxBench = team?.max_bench_quarters ?? 2
    const targetPlayed = team?.target_quarters_played ?? 3
    const quarters = [1, 2, 3, 4].filter((q) =>
      q === selectedQuarter ? lineup.length > 0 : quarterHasLineup(q)
    )

    if (quarters.length < 2) return []

    return players.flatMap((player) => {
      const played = quarters.filter((q) => {
        const source = q === selectedQuarter ? lineup : allGameLineups
        return source.some((item) => item.quarter === q && item.player_id === player.id)
      }).length
      const bench = quarters.length - played
      const name = '#' + (player.jersey_number ?? '-') + ' ' + (player.first_name || player.name.split(' ')[0])

      if (bench > maxBench) {
        return ['Team rule violation: ' + name + ' is scheduled to bench ' + bench + ' quarters. Maximum allowed is ' + maxBench + '.']
      }

      if (bench >= 2 && played < targetPlayed && quarters.length === 4) {
        return ['Rotation preference: ' + name + ' is scheduled to bench ' + bench + ' quarters. This is within the ' + maxBench + '-quarter bench rule, but below the preferred target of ' + targetPlayed + ' quarters played.']
      }

      return []
    })
  }


  function optimizeCurrentQuarter() {
    const result = rotationAdvice()
    setQuarterSuggestion(result)
    return result
  }

  function optimizeWholeGame() {
    const result = getSharedWholeGamePlan({
      players,
      teamRules: team,
      attendance: gameAttendance,
      plannedLineups: allGameLineups,
      gameSituation,
      formation: optimizationFormation,
      quarter: selectedQuarter,
    })
    setWholeGameSuggestion(result.gamePlan)
    return result

  }

  async function applyWholeGamePlan() {
    const result = wholeGameSuggestion ? { gamePlan: wholeGameSuggestion, warnings: [] as string[] } : optimizeWholeGame()
    const gamePlan = result.gamePlan
    if (gamePlan.length === 0 || !selectedGame) {
      alert('No whole-game plan is available.')
      return
    }

    const confirmed = window.confirm('Replace all four planned quarter lineups with the Coach Assist whole-game plan?')
    if (!confirmed) return

    setSavingLineup(true)
    const { error } = await supabase
      .from('game_lineups')
      .delete()
      .eq('game_id', selectedGame.id)
    if (error) {
      setSavingLineup(false)
      alert(`Could not replace the game plan: ${error.message}`)
      return
    }

    const rows = gamePlan.map((item) => ({
      game_id: selectedGame.id,
      quarter: item.quarter,
      player_id: item.player_id,
      position: item.position,
    }))

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from('game_lineups').insert(rows)
      if (insertError) {
        setSavingLineup(false)
        alert(`Could not save the whole-game plan: ${insertError.message}`)
        return
      }
    }

    setAllGameLineups(gamePlan)
    setLineup(gamePlan.filter((item) => item.quarter === selectedQuarter))
    setWholeGameSuggestion(gamePlan)
    setSavingLineup(false)
    alert('Whole-game plan applied.')
  }

  function applySuggestedLineup() {
    const advice = quarterSuggestion || rotationAdvice()

    if (advice.suggestedLineup.length === 0) {
      alert('No complete suggestion is available for this quarter.')
      return
    }

    if (lineup.length > 0) {
      const confirmed = window.confirm(
        `Replace the current Q${selectedQuarter} lineup with the Coach Assist suggestion?`
      )
      if (!confirmed) return
    }

    setLineup(
      advice.suggestedLineup.map(({ position, player }) => ({
        player_id: player.id,
        quarter: selectedQuarter,
        position,
      }))
    )
  }

  const upcomingGames = useMemo(() => {
    return games.filter((game) => game.status !== 'Completed')
  }, [games])

  const completedGames = useMemo(
    () => games.filter((game) => game.status === 'Completed'),
    [games]
  )

  const teamRecord = useMemo(() => {
    let wins = 0
    let losses = 0
    let draws = 0
    let goalsFor = 0
    let goalsAgainst = 0

    completedGames.forEach((game) => {
      const events = gameEvents.filter((event) => event.game_id === game.id)
      const forGoals = events.filter((event) => event.event_type === 'our_goal').length
      const againstGoals = events.filter((event) => event.event_type === 'their_goal').length
      goalsFor += forGoals
      goalsAgainst += againstGoals

      if (forGoals > againstGoals) wins += 1
      else if (forGoals < againstGoals) losses += 1
      else draws += 1
    })

    return {
      wins,
      losses,
      draws,
      goalsFor,
      goalsAgainst,
      gamesPlayed: completedGames.length,
      winPct: completedGames.length > 0 ? Math.round((wins / completedGames.length) * 100) : 0,
    }
  }, [completedGames, gameEvents])

  const completedGameIds = useMemo(
    () => new Set(completedGames.map((game) => game.id)),
    [completedGames]
  )

  const completedSeasonLineups = useMemo(() => {
    const actualKeys = new Set(
      actualSeasonLineups
        .filter((item) => completedGameIds.has(item.game_id))
        .map((item) => `${item.game_id}:${item.quarter}`)
    )

    return [
      ...seasonLineups.filter(
        (item) =>
          completedGameIds.has(item.game_id) &&
          !actualKeys.has(`${item.game_id}:${item.quarter}`)
      ),
      ...actualSeasonLineups.filter((item) =>
        completedGameIds.has(item.game_id)
      ),
    ]
  }, [seasonLineups, actualSeasonLineups, completedGameIds])

  const completedGameEvents = useMemo(
    () => gameEvents.filter((event) => completedGameIds.has(event.game_id)),
    [gameEvents, completedGameIds]
  )
  const completedPositionAnalytics = useMemo(() => {
    const result = new Map<string, { played: number; gk: number; def: number; mid: number; str: number; bench: number }>()
    const addPosition = (
      current: { played: number; gk: number; def: number; mid: number; str: number; bench: number },
      position: string,
      value: number
    ) => {
      if (position === 'Bench') {
        current.bench += value
        return
      }

      current.played += value
      if (position === 'Goalkeeper') current.gk += value
      else if (position.includes('Defense')) current.def += value
      else if (position.includes('Mid')) current.mid += value
      else current.str += value
    }

    for (const game of completedGames) {
      for (let quarter = 1; quarter <= 4; quarter++) {
        const segmentRows = positionSegments
          .filter((segment) => segment.game_id === game.id && segment.quarter === quarter)
          .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())

        if (segmentRows.length > 0) {
          const rowsByPlayer = new Map<string, PositionSegment[]>()
          for (const segment of segmentRows) {
            const rows = rowsByPlayer.get(segment.player_id) || []
            rows.push(segment)
            rowsByPlayer.set(segment.player_id, rows)
          }

          for (const player of players) {
            const current = result.get(player.id) || { played: 0, gk: 0, def: 0, mid: 0, str: 0, bench: 0 }
            const rows = rowsByPlayer.get(player.id) || []

            if (rows.length === 0) {
              current.bench += 1
            } else {
              const firstPosition = rows[0].position
              const lastPosition = rows[rows.length - 1].position

              if (firstPosition === lastPosition) {
                addPosition(current, firstPosition, 1)
              } else {
                // A mid-quarter change is intentionally discrete: half a quarter
                // in the starting position and half in the ending position.
                addPosition(current, firstPosition, 0.5)
                addPosition(current, lastPosition, 0.5)
              }
            }

            result.set(player.id, current)
          }

          continue
        }

        const fallbackRows = completedSeasonLineups.filter(
          (item) => item.game_id === game.id && item.quarter === quarter
        )
        for (const player of players) {
          const current = result.get(player.id) || { played: 0, gk: 0, def: 0, mid: 0, str: 0, bench: 0 }
          const item = fallbackRows.find((row) => row.player_id === player.id)

          if (!item) {
            current.bench += 1
          } else {
            addPosition(current, item.position, 1)
          }

          result.set(player.id, current)
        }
      }
    }

    return result
  }, [completedGames, completedSeasonLineups, players, positionSegments])

  const topScorers = useMemo(() => {
    const totals = new Map<string, number>()
    completedGameEvents
      .filter((event) => event.event_type === 'our_goal' && event.player_id)
      .forEach((event) => {
        const playerId = event.player_id as string
        totals.set(playerId, (totals.get(playerId) || 0) + 1)
      })

    return [...totals.entries()]
      .map(([playerId, goals]) => ({
        player: players.find((player) => player.id === playerId),
        goals,
      }))
      .filter((entry) => entry.player)
      .sort((a, b) => b.goals - a.goals)
      .slice(0, 3)
  }, [completedGameEvents, players])

  if (loading) {
    return (
      <div className="app" style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
        <header className="app-header">
          <div className="header-content">
            <h1>Beautiful Game IQ</h1>
            <p>Know the game. Coach the moment.</p>
            <p style={{ marginTop: '4px', opacity: 0.85 }}>Your AI copilot for game day.</p>
          </div>
        </header>

  
      {bugReportOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: '20px' }}>
          <section style={{ background: 'white', color: '#111', borderRadius: '16px', padding: '22px', width: 'min(560px, 100%)', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <h2 style={{ marginTop: 0 }}>Report a Bug</h2>
            <p style={{ marginTop: 0 }}>Tell us what went wrong. The report is securely tracked and sent to Beautiful Game IQ support with useful diagnostic information.</p>
            <label style={{ display: 'block', marginBottom: '12px' }}>
              <span>Severity</span>
              <select value={bugReport.severity} onChange={(e) => setBugReport({ ...bugReport, severity: e.target.value })} style={{ width: '100%' }}>
                <option>Low</option><option>Normal</option><option>High</option><option>Game Day Critical</option>
              </select>
            </label>
            <label style={{ display: 'block', marginBottom: '12px' }}>
              <span>What is wrong?</span>
              <input value={bugReport.summary} onChange={(e) => setBugReport({ ...bugReport, summary: e.target.value })} placeholder="Example: Save lineup button does nothing" style={{ width: '100%' }} />
            </label>
            <label style={{ display: 'block', marginBottom: '16px' }}>
              <span>What happened?</span>
              <textarea value={bugReport.details} onChange={(e) => setBugReport({ ...bugReport, details: e.target.value })} placeholder="What did you click, what did you expect, and what happened instead?" rows={6} style={{ width: '100%' }} />
            </label>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setBugReportOpen(false)}>Cancel</button>
              <button type="button" className="primary-button" disabled={!bugReport.summary.trim() || !bugReport.details.trim()} onClick={submitBugReport}>Send Bug Report</button>
            </div>
          </section>
        </div>
      )}

        <main className={/^\/(?:admin\/)?analytics\/?$/.test(window.location.pathname) ? 'main-content analytics-route' : 'main-content'}>
          <p>Loading...</p>
        </main>
      </div>
    )
  }

  function renderCoaches() {
    return (
      <>
        <button className="back-button" onClick={() => { setArchivedViewTeam(null); setScreen('home'); void loadApp(selectedTeamId, false) }}>
          Back
        </button>

        <section className="team-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">TEAM STAFF</p>
              <h2>Coaches & Staff</h2>
              <span>People who can access {team?.name || 'this team'}.</span>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '10px', marginTop: '14px' }}>
            {currentUserRole === 'owner' && joinRequests.length > 0 && (
              <div style={{ marginBottom: '18px', padding: '14px', border: '1px solid #ddd', borderRadius: '10px' }}>
                <strong>Join Requests</strong>
                <p style={{ margin: '6px 0 12px', fontSize: '13px', opacity: 0.75 }}>
                  People requesting access to {team?.name || 'this team'}.
                </p>

                <div style={{ display: 'grid', gap: '10px' }}>
                  {joinRequests.map((request) => (
                    <div key={request.id} style={{ border: '1px solid #ddd', borderRadius: '10px', padding: '12px', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: 'block' }}>{request.full_name}</strong>
                        {request.email && <span style={{ fontSize: '12px', opacity: 0.7 }}>{request.email}</span>}
                      </div>

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button className="primary-button" onClick={() => approveJoinRequest(request)}>
                          Approve
                        </button>
                        <button className="secondary-button" onClick={() => denyJoinRequest(request)}>
                          Deny
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {staff.map((member) => {
              const isCurrentUser = member.user_id === currentUserId
              return (
                <div key={member.user_id} style={{ border: '1px solid #ddd', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block' }}>{member.full_name}</strong>
                    {member.email && <span style={{ fontSize: '12px', opacity: 0.7 }}>{member.email}</span>}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700 }}>
                        {member.role === 'owner' ? 'OWNER' : member.is_head_coach ? 'HEAD COACH' : member.role === 'coach' ? 'ASSISTANT COACH' : 'VIEWER'}
                      </span>
                      {member.role === 'owner' && (
                        <span style={{ fontSize: '12px', fontWeight: 700 }}>{member.is_head_coach ? 'HEAD COACH' : 'ASSISTANT COACH'}</span>
                      )}
                    </div>

                    {currentUserRole === 'owner' && (
                      <>
                        {!isCurrentUser && member.role !== 'owner' && (
                          <select
                            value={member.role}
                            onChange={(e) => updateStaffRole(member, e.target.value as 'coach' | 'viewer')}
                            aria-label={`Role for ${member.full_name}`}
                          >
                            <option value="coach">Assistant Coach</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        )}

                        {member.role !== 'viewer' && (
                          <button
                            className="secondary-button"
                            onClick={() => setHeadCoach(member, !member.is_head_coach)}
                          >
                            {member.is_head_coach ? 'Make Assistant Coach' : 'Make Head Coach'}
                          </button>
                        )}

                        {!isCurrentUser && member.role !== 'owner' && (
                          <button
                            className="secondary-button"
                            onClick={() => removeStaffMember(member)}
                          >
                            Remove
                          </button>
                        )}

                        {isCurrentUser && (
                          <span style={{ fontSize: '12px', opacity: 0.7 }}>You</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {currentUserRole !== 'owner' && (
            <div style={{ marginTop: '18px', padding: '14px', border: '1px solid #ead2d2', borderRadius: '10px', background: '#fffafa' }}>
              <strong>Leave This Team</strong>
              <p style={{ margin: '6px 0 12px', fontSize: '13px', opacity: 0.75 }}>
                Joined the wrong team or no longer need access? You can leave this team yourself. The team owner does not need to remove you.
              </p>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void leaveTeam()}
              >
                Leave Team
              </button>
            </div>
          )}

          {currentUserRole === 'owner' && (
          <div style={{ marginTop: '18px', padding: '14px', border: '1px solid #ddd', borderRadius: '10px' }}>
            <strong>Invite a Coach</strong>
            <p style={{ margin: '6px 0 12px', fontSize: '13px', opacity: 0.75 }}>
              Invite a coach by email. If they already have a Beautiful Game IQ account, they'll be added directly to this team; otherwise they'll receive an account invitation.
            </p>
            <button
              className="primary-button"
              onClick={async () => {
                const email = window.prompt('Assistant coach email:')
                if (!email) return

                const role = 'coach' as const

                const { data, error } = await supabase.functions.invoke('invite-coach', {
                  body: {
                    team_id: selectedTeamId,
                    email: email.trim(),
                    role,
                  },
                })

                if (error) {
                  console.error('Invite failed:', error)
                  alert(`Invitation failed: ${error.message}`)
                  return
                }

                if (data?.error) {
                  alert(data.error)
                  return
                }

                alert(data?.already_registered ? `Coach added to ${team?.name || "the team"}. If they have not completed account setup yet, check their email for the invitation.` : `Invitation sent to ${email.trim()}. Check the email to create the Beautiful Game IQ account and join the team as a Coach.`)
                await loadApp(selectedTeamId)
              }}
            >
              + Invite Assistant Coach
            </button>
          </div>
          )}
        </section>
      </>
    )
  }

  function renderHelp() {
    const guideSteps = [
      { title: 'Set up your team', goal: 'Create the team you will manage in Beautiful Game IQ.', detail: 'Enter your team name, city, coach name, age group, game format, season and year. This creates the team under your current account.', takeaway: 'Create the team first. You can add players and set team rules next.', action: 'Create Your Team', screen: 'home' },
      { title: 'Add your players', goal: 'Build the roster the lineup planner will use.', detail: 'Open Roster, enter a player’s first name and jersey number, then select Add Player. Repeat for everyone on the team.', takeaway: 'A complete roster makes attendance, rotations and game stats more reliable.', action: 'Open Roster', screen: 'roster' },
      { title: 'Schedule a game', goal: 'Create the match before planning who plays.', detail: 'Open Games and create a new game with the opponent, date, time and location. Then set attendance for that game.', takeaway: 'Schedule first, set attendance, then build the lineup.', action: 'Schedule a Game', screen: 'new-game' },
      { title: 'Set game attendance', goal: 'Make sure the plan only relies on players who can actually play.', detail: 'For the selected game, mark each player available for the quarters they can attend, or mark them absent for the whole game. You can change availability if plans change.', takeaway: 'Update attendance before building or optimizing the lineup.', action: 'Open Attendance', screen: 'attendance' },
      { title: 'Build your lineup', goal: 'Plan all four quarters—not just the opening whistle.', detail: 'Open Build Lineup, choose a formation and assign players to positions in each quarter. Review the rotation and save the lineup when it looks right.', takeaway: 'Review every quarter and Rotation Check before saving.', action: 'Build Lineup', screen: 'lineup' },
      { title: 'Optimize the lineup', goal: 'Use the optimizer as a second set of eyes—not as a replacement for coaching.', detail: 'Optimize All 4 Quarters can generate a full-game rotation using team rules, attendance, position fit, goalkeeper limits and bench rotation. During a live game, you can also optimize the current quarter or another quarter as the match situation changes.', takeaway: 'Review each suggested quarter and its warnings. Optimization is available before the match and during Live Game.', action: 'Open Games', screen: 'games' },
      { title: 'Set team rules', goal: 'Set the playing-time and formation rules for your team.', detail: 'Open Team Rules to set maximum goalkeeper quarters, maximum bench quarters, target quarters played, the everyone-must-play rule and the default formation.', takeaway: 'Set these once before planning lineups, then revisit them if your league rules change.', action: 'Open Team Rules', screen: 'team-rules' },
      { title: 'Set player ratings', goal: 'Give the planner useful coaching context about each player.', detail: 'Open a player from the roster to review their profile, ratings, position strengths and coaching notes. Keep ratings consistent and focused on soccer performance and development.', takeaway: 'Ratings are coaching inputs, not labels. Revisit them as players learn and develop.', action: 'Open Roster', screen: 'roster' },
      { title: 'Review analytics', goal: 'Use the season view to spot patterns over time.', detail: 'Player Analytics helps you review quarters played, goalkeeper and striker usage, bench time, goals, assists, shots and saves. Look for trends across games rather than judging a player from one match.', takeaway: 'Use analytics to ask better coaching questions about balanced playing time and development.', action: 'View Analytics', screen: 'home' },
      { title: 'Track the match', goal: 'Record match events as they happen.', detail: 'During the game, use Live Game to record goals, assists, shots and saves. You can also adjust quarter lineups and run optimization as the match develops.', takeaway: 'Check the event log to verify entries and correct mistakes promptly.', action: 'Open Live Game', screen: 'live-game' },
    ] as const
    const guideActions = [
      ['Choose Create Your Team and fill in the team details.', 'Confirm age group and game format.', 'Create the team, then continue to the roster.'],
      ['Open Roster and enter the player’s first name and jersey number.', 'Select Add Player.', 'Repeat for each player on the team.'],
      ['Open Games and select Schedule a Game.', 'Enter the opponent, date, time and location.', 'Create the game, then set attendance for that match.'],
      ['Open Attendance for the selected game.', 'Mark each player available for the quarters they can play, or choose Absent.', 'Return to the lineup when availability is correct.'],
      ['Open the game and choose Build Lineup.', 'Choose a formation, then assign players in each quarter.', 'Review Rotation Check and save the plan.'],
      ['Before kickoff, use Optimize All 4 Quarters for a starting plan.', 'Review each quarter and every warning.', 'During Live Game, optimize a quarter again if the match situation changes.'],
      ['Open Team Rules from the team dashboard.', 'Confirm the game format and default formation.', 'Set goalkeeper, bench and playing-time limits.'],
      ['Open a player from the roster.', 'Update ratings, position preferences and coaching notes.', 'Keep notes specific, constructive and focused on development.'],
      ['Open the team season/player analytics view.', 'Review playing time and match events across games.', 'Compare multiple games before deciding whether a pattern needs attention.'],
      ['Open the game and enter Live Game.', 'Record goals, assists, shots and saves as they happen.', 'Revisit quarter lineups or optimize again if needed.'],
    ] as const
    // These paths match the newly named screenshots in /public.
    const guideScreenshots = [
      '/New%20Team.png',
      '/Roster.png',
      '/new%20game.png',
      '/attendence.png',
      '/lineup%20builder.png',
      '/optimize.png',
      '/team%20rules.png',
      '/ratings.png',
      '/analytics.png',
      '/live%20game.png',
    ] as const
    const guideScreenshot = guideScreenshots[helpStep]
    const step = guideSteps[helpStep] || guideSteps[0]
    return (
      <section className="team-card coach-guide">
        <p className="eyebrow">HELP &amp; LEARNING</p>
        <h2>Getting Started</h2>
        <p className="coach-guide-intro">A practical tour of the decisions you make before and during game day. Work through a lesson, then try it with your own team when you're ready.</p>
        <div className="guide-progress" aria-label={`Step ${helpStep + 1} of ${guideSteps.length}`}>
          {guideSteps.map((item, index) => (
            <button key={item.title} type="button" aria-current={helpStep === index ? 'step' : undefined} className={helpStep === index ? 'active' : ''} onClick={() => setHelpStep(index)}>
              <span className="guide-progress-number">{index + 1}</span>
              <span>{item.title}</span>
            </button>
          ))}
        </div>
        <div className="guide-lesson">
          <div className="guide-lesson-copy">
            <p className="eyebrow">LESSON {helpStep + 1} OF {guideSteps.length}</p>
            <h3>{step.title}</h3>
            <h4>Your goal</h4>
            <p>{step.goal}</p>
            <h4>What to know</h4>
            <p>{step.detail}</p>
            <h4>Follow these steps in the app</h4>
            <div className="guide-numbered-actions" role="list">
              {guideActions[helpStep].map((action, index) => <div className="guide-action-item" role="listitem" key={action}><span aria-hidden="true">{index + 1}</span><p>{action}</p></div>)}
            </div>
            <div className="coach-guide-note"><strong>Coach's takeaway</strong><p>{step.takeaway}</p></div>
          </div>
          <div className="guide-visual" aria-label={`App workflow preview: ${step.title}`}>
            <div className="guide-app-window">
              <div className="guide-app-toolbar"><span className="guide-app-mark">BGIQ</span><strong>Beautiful Game IQ</strong><span className="guide-app-context">{['Create Your Team','Add Players','Schedule Game','Attendance','Build Lineup','Optimize Lineup','Team Rules','Player Ratings','Analytics','Live Game'][helpStep]}</span></div>
              <div className="guide-app-content">
                {guideScreenshot ? (
                  <a
                    className="guide-screenshot-link"
                    href={guideScreenshot}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open full-size screenshot for ${step.title}`}
                    title="Open full-size screenshot"
                  >
                    <img
                      className="guide-real-screenshot"
                      src={guideScreenshot}
                      alt={`Beautiful Game IQ screenshot for ${step.title}`}
                    />
                  </a>
                ) : (
                  <div className="guide-screenshot-missing" role="note">
                    A matching screenshot for this lesson has not been added yet.
                  </div>
                )}
              </div>
            </div>
            <p className="guide-visual-caption">{guideScreenshot ? 'Screenshot of the matching app workflow. Open it to view full size.' : 'This lesson is ready to follow in the app; a matching screenshot is not available yet.'}</p>
          </div>
        </div>
        <div className="guide-practice">
          <div><strong>Ready to try it?</strong><p>The lesson stays here. Use this button only when you want to work in the actual app.</p></div>
          <button className="secondary-button" type="button" onClick={() => { setHelpReturnScreen('help'); setScreen(step.screen) }}>{step.action}</button>
        </div>
        <div className="quick-actions guide-navigation">
          <button type="button" className="secondary-button" disabled={helpStep === 0} onClick={() => setHelpStep((current) => Math.max(0, current - 1))}>Previous Lesson</button>
          <span>{helpStep + 1} / {guideSteps.length}</span>
          <button type="button" className="secondary-button" disabled={helpStep === guideSteps.length - 1} onClick={() => setHelpStep((current) => Math.min(guideSteps.length - 1, current + 1))}>Next Lesson</button>
        </div>
      </section>
    )
  }

  function renderTeamRules() {
    return (
      <>
        <button className="back-button" onClick={async () => { setArchivedViewTeam(null); await loadApp(); setScreen(helpReturnScreen) }}>
          Back
        </button>

        <section className="team-card">
          <div className="section-header">
            <div>
              <h2>Team Rules</h2>
              <span>{team?.name}</span>
            </div>
          </div>

          <p>Set the league rules for this team. Coach Assist will use these rules instead of assuming every league is the same.</p>

          <div className="form-grid">
            <label>
              Max GK quarters
              <input type="number" min="0" max="4" value={maxGkQuarters} onChange={(e) => setMaxGkQuarters(e.target.value)} />
            </label>

            <label>
              Max bench quarters
              <input type="number" min="0" max="4" value={maxBenchQuarters} onChange={(e) => setMaxBenchQuarters(e.target.value)} />
            </label>

            <label>
              Target quarters played
              <input type="number" min="0" max="4" value={targetQuartersPlayed} onChange={(e) => setTargetQuartersPlayed(e.target.value)} />
            </label>
          </div>

          <label style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '16px' }}>
            <input type="checkbox" checked={requireEveryonePlay} onChange={(e) => setRequireEveryonePlay(e.target.checked)} />
            Everyone must play when available
          </label>

          <label style={{ display: 'grid', gap: '6px', marginTop: '16px' }}>
            Default formation
            <span style={{ fontSize: '12px', opacity: 0.7 }}>This is the starting shape for new game-day lineups and Coach Assist.</span>
            <select
              value={defaultFormation}
              onChange={(e) => setDefaultFormation(e.target.value)}
            >
              {getFormationsForFormat(team?.format || '7v7').map((formation) => (
                <option key={formation} value={formation}>{formation}</option>
              ))}
            </select>
          </label>

          <button className="primary-button" onClick={saveTeamRules} style={{ marginTop: '16px' }}>
            Save Team Rules
          </button>
          {currentUserRole === 'owner' && (
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
              <button className="secondary-button" onClick={toggleTeamArchived}>
                {team?.archived ? 'Unarchive Team' : 'Archive Team'}
              </button>
            </div>
          )}
        </section>
      </>
    )
  }

  async function submitBugReport() {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      alert('Please sign in again before sending a bug report.')
      return
    }

    const { data, error } = await supabase.functions.invoke('report-bug', {
      body: {
        team_id: team?.id || selectedTeamId || null,
        severity: bugReport.severity,
        summary: bugReport.summary.trim(),
        details: bugReport.details.trim(),
        screen,
        page_url: window.location.href,
        app_version: APP_VERSION,
        platform: APP_PLATFORM,
        user_agent: navigator.userAgent,
      },
    })

    if (error) {
      console.error(error)
      alert(`Could not send bug report: ${error.message}`)
      return
    }

    const reportId = data?.report_id
    setBugReportOpen(false)
    setBugReport({ severity: 'Normal', summary: '', details: '' })
    alert(reportId ? `Bug report submitted. Reference #${String(reportId).slice(0, 8)}.` : 'Bug report submitted. Thank you.')
  }

  function handleAnalyticsSort(field: 'player' | 'played' | 'gk' | 'str' | 'bench' | 'goals' | 'assists' | 'shots' | 'saves' | 'captain') {
    if (analyticsSort === field) {
      setAnalyticsSortAsc((value) => !value)
    } else {
      setAnalyticsSort(field)
      setAnalyticsSortAsc(field === 'player')
    }
  }

  function analyticsSortValue(player: typeof players[number]) {
    const usage = completedPositionAnalytics.get(player.id) || {
      played: 0,
      gk: 0,
      def: 0,
      mid: 0,
      str: 0,
      bench: 0,
    }
    const played = usage.played
    const gk = usage.gk
    const str = usage.str
    const bench = usage.bench
    const goals = completedGameEvents.filter(
      (event) => event.event_type === 'our_goal' && event.player_id === player.id
    ).length
    const assists = completedGameEvents.filter(
      (event) => event.event_type === 'our_goal' && event.assister_id === player.id
    ).length
    const shots = completedGameEvents.filter((event) => event.event_type === 'our_shot' && event.player_id === player.id).length
    const saves = completedGameEvents.filter((event) => event.event_type === 'save' && event.player_id === player.id).length
    const captain = completedGames.filter(
      (game) => game.captain_1_id === player.id || game.captain_2_id === player.id
    ).length

    if (analyticsSort === 'player') return player.name.toLowerCase()
    return { played, gk, str, bench, goals, assists, shots, saves, captain }[analyticsSort]
  }

  async function searchTeamsToJoin() {
    const search = joinTeamSearch.trim()
    const code = joinCodeSearch.trim().toUpperCase()

    if (!search && !code) {
      setJoinTeamResults([])
      return
    }

    let query = supabase
      .from('teams')
      .select('*')
      .eq('archived', false)

    if (code) {
      query = query.eq('join_code', code)
    } else {
      query = query.or('name.ilike.%' + search + '%,city.ilike.%' + search + '%,coach_name.ilike.%' + search + '%')
    }

    const { data, error } = await query.order('name').limit(20)

    if (error) {
      console.error(error)
      alert(`Could not search teams: ${error.message}`)
      return
    }

    setJoinTeamResults(data || [])
  }
  async function loadJoinRequests() {
    const { data, error } = await supabase
      .from('team_join_requests')
      .select('team_id')
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id || '')
      .eq('status', 'pending')

    if (error) {
      console.error(error)
      return
    }

    setJoinRequestTeamIds((data || []).map((request) => request.team_id))
  }

  async function loadOwnerJoinRequests() {
    if (currentUserRole !== 'owner' || !selectedTeamId) {
      setJoinRequests([])
      return
    }

    const { data, error } = await supabase
      .from('team_join_requests')
      .select('id, team_id, user_id, status, created_at')
      .eq('team_id', selectedTeamId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) {
      console.error(error)
      alert(`Could not load join requests: ${error.message}`)
      return
    }

    const requests = await Promise.all(
      (data || []).map(async (request) => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('id', request.user_id)
          .maybeSingle()

        return {
          ...request,          full_name: profile?.full_name || 'Unknown User',
          email: profile?.email || '',
        }
      })
    )

    setJoinRequests(requests)
  }
  async function approveJoinRequest(request: {
    id: string
    team_id: string
    user_id: string
    status: 'pending' | 'approved' | 'denied'
    created_at: string
    full_name: string
    email: string
  }) {
    if (currentUserRole !== 'owner' || !selectedTeamId) return

    const { error: memberError } = await supabase
      .from('team_members')
      .insert({
        team_id: request.team_id,
        user_id: request.user_id,
        role: 'coach',
        is_head_coach: false,
      })

    if (memberError && memberError.code !== '23505') {
      console.error(memberError)
      alert(`Could not approve ${request.full_name}: ${memberError.message}`)
      return
    }

    const { error: requestError } = await supabase
      .from('team_join_requests')
      .update({
        status: 'approved',
        updated_at: new Date().toISOString(),
      })
      .eq('id', request.id)

    if (requestError) {
      console.error(requestError)
      alert(`The team member was added, but the join request could not be updated: ${requestError.message}`)
      return
    }

    await loadOwnerJoinRequests()
    await loadApp(selectedTeamId)
  }

  async function denyJoinRequest(request: {
    id: string
    team_id: string
    user_id: string
    status: 'pending' | 'approved' | 'denied'
    created_at: string
    full_name: string
    email: string
  }) {
    if (currentUserRole !== 'owner' || !selectedTeamId) return

    const { error } = await supabase
      .from('team_join_requests')
      .update({
        status: 'denied',
        updated_at: new Date().toISOString(),
      })
      .eq('id', request.id)

    if (error) {
      console.error(error)
      alert(`Could not deny ${request.full_name}'s request: ${error.message}`)
      return
    }

    await loadOwnerJoinRequests()
  }
  async function requestToJoinTeam(teamToJoin: Team) {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError) {
        console.error(userError)
        alert(`Could not identify the signed-in user: ${userError.message}`)
        return
      }

      const userId = user?.id

      if (!userId) {
        alert('Could not identify the signed-in user. Please sign out and sign back in.')
        return
      }

      if (joinRequestTeamIds.includes(teamToJoin.id)) {
        return
      }

      const { error } = await supabase
        .from('team_join_requests')
        .insert({
          team_id: teamToJoin.id,
          user_id: userId,
          status: 'pending',
        })

      if (error) {
        if (error.code === '23505') {
          const { data: existingRequest, error: existingRequestError } = await supabase
            .from('team_join_requests')
            .select('id, status')
            .eq('team_id', teamToJoin.id)
            .eq('user_id', userId)
            .maybeSingle()

          if (existingRequestError) {
            console.error(existingRequestError)
            alert(`Could not check the existing join request: ${existingRequestError.message}`)
            return
          }

          if (existingRequest?.status === 'pending') {
            setJoinRequestTeamIds((current) =>
              current.includes(teamToJoin.id) ? current : [...current, teamToJoin.id]
            )
            return
          }

          if (existingRequest?.status === 'denied') {
            const { error: retryError } = await supabase
              .from('team_join_requests')
              .update({
                status: 'pending',
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingRequest.id)
              .eq('user_id', userId)

            if (retryError) {
              console.error(retryError)
              alert(`Could not retry the request to join ${teamToJoin.name}: ${retryError.message}`)
              return
            }

            setJoinRequestTeamIds((current) =>
              current.includes(teamToJoin.id) ? current : [...current, teamToJoin.id]
            )
            return
          }

          if (existingRequest?.status === 'approved') {
            alert(`Your request to join ${teamToJoin.name} was already approved.`)
            return
          }

          await loadJoinRequests()
          return
        }

        console.error(error)
        alert(`Could not request to join ${teamToJoin.name}: ${error.message}`)
        return
      }

      setJoinRequestTeamIds((current) =>
        current.includes(teamToJoin.id) ? current : [...current, teamToJoin.id]
      )
    } catch (error) {
      console.error(error)
      alert(`Join request failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  function renderNewUserOnboarding() {
    return (
      <section className="team-card" style={{ maxWidth: '620px', margin: '40px auto' }}>
        <div className="section-header">
          <h2>Welcome to Beautiful Game IQ</h2>
        </div>

        <p style={{ marginTop: '12px', lineHeight: 1.6 }}>
          Let's get your team set up. You can create a new team or join an existing team.
        </p>

        <div style={{ display: 'grid', gap: '12px', marginTop: '24px' }}>
          <button
            className="primary-button"
            onClick={() => setShowNewTeamForm(true)}
          >
            Create Your Team
          </button>

          <button
            className="secondary-button"
            onClick={async () => {
                setShowJoinTeam(true)
                setJoinTeamSearch('')
                setJoinCodeSearch('')
                setJoinTeamResults([])
                await loadJoinRequests()
              }}
          >
            Join an Existing Team
          </button>
        </div>

        {showJoinTeam && (
          <div style={{ marginTop: '24px' }}>
            <h3>Join an Existing Team</h3>
            <div style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
              <label>Search team, city, or coach<input value={joinTeamSearch} onChange={(e) => setJoinTeamSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void searchTeamsToJoin() }} placeholder="e.g. Blue Knights" /></label>
              <label>Exact Join Code<input value={joinCodeSearch} onChange={(e) => setJoinCodeSearch(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter') void searchTeamsToJoin() }} placeholder="6-character code" maxLength={6} autoCapitalize="characters" /></label>
              <button className="primary-button" onClick={searchTeamsToJoin} disabled={!joinTeamSearch.trim() && !joinCodeSearch.trim()}>Search Teams</button>
            </div>
            {joinTeamResults.length > 0 && (
              <div style={{ display: 'grid', gap: '12px', marginTop: '20px' }}>
                {joinTeamResults.map((teamToJoin) => {
                  const requestPending = joinRequestTeamIds.includes(teamToJoin.id)
                  return (
                    <div key={teamToJoin.id} className="team-card" style={{ padding: '16px' }}>
                      <strong>{teamToJoin.name}</strong>
                      <div style={{ marginTop: '6px', color: '#666' }}>{[teamToJoin.city, teamToJoin.coach_name, teamToJoin.age_group, teamToJoin.format, teamToJoin.season].filter(Boolean).join(' · ')}</div>
                      <button
                        type="button"
                        className={requestPending ? 'secondary-button' : 'primary-button'}
                        style={{ marginTop: '12px', touchAction: 'manipulation' }}
                        onClick={() => void requestToJoinTeam(teamToJoin)}
                        disabled={requestPending}
                      >
                        {requestPending ? 'Request Sent' : 'Request to Join'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            {(joinTeamSearch.trim() || joinCodeSearch.trim()) && joinTeamResults.length === 0 && <p style={{ marginTop: '16px', color: '#666' }}>No active teams found.</p>}
          </div>
        )}        {showNewTeamForm && (
          <div id="new-team-form" style={{ marginTop: '24px' }}>
            <h3>Create Your Team</h3>

            <div className="form-grid">
              <label>
                Team Name
                <input
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="Enter team name"
                />
              </label>
              <label>
                City
                <input value={newTeamCity} onChange={(e) => setNewTeamCity(e.target.value)} placeholder="e.g. Redlands" />
              </label>

              <label>
                Coach Name
                <input value={newTeamCoachName} onChange={(e) => setNewTeamCoachName(e.target.value)} placeholder="Head coach name" />
              </label>


              <label>
                Age Group
                <select
                  value={newTeamAgeGroup}
                  onChange={(e) => setNewTeamAgeGroup(e.target.value)}
                >
                  {['U08','U09','U10','U11','U12','U13','U14','U15','U16','U17','U18'].map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>

              <label>
                Format
                <select
                  value={newTeamFormat}
                  onChange={(e) => setNewTeamFormat(e.target.value)}
                >
                  <option value="6v6">6v6</option>
                  <option value="7v7">7v7</option>
                  <option value="9v9">9v9</option>
                  <option value="11v11">11v11</option>
                </select>
              </label>

              <label>
                Season
                <select
                  value={newTeamSeasonType}
                  onChange={(e) => setNewTeamSeasonType(e.target.value)}
                >
                  {['Fall','Winter','Spring','Summer','Year Round'].map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>

              <label>
                Year
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={newTeamSeasonYear}
                  onChange={(e) => setNewTeamSeasonYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="YYYY"
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button className="primary-button" onClick={createTeam}>
                Create Team
              </button>

              <button
                className="secondary-button"
                onClick={() => setShowNewTeamForm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}        {archivedTeams.length > 0 && (
          <>
            <button
              className="secondary-button"
              style={{ marginTop: '24px', width: '100%' }}
              onClick={() => setShowArchivedTeams((value) => !value)}
            >
              {showArchivedTeams ? 'Hide Archived Teams' : 'Show Archived Teams'}
            </button>

            {showArchivedTeams && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                {archivedTeams.map((archivedTeam) => (
                  <div key={archivedTeam.id} className="team-card" style={{ padding: '16px', marginTop: '12px' }}>
                    <strong>{archivedTeam.name}</strong>
                    <div style={{ marginTop: '6px', color: '#666' }}>
                      {archivedTeam.age_group} | {archivedTeam.format} | {archivedTeam.season}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                      <button className="secondary-button" onClick={() => viewArchivedTeam(archivedTeam)}>
                        View Season
                      </button>
                      {currentUserRole === 'owner' && (
                        <button className="primary-button" onClick={async () => {
                          const { error } = await supabase
                            .from('teams')
                            .update({ archived: false })
                            .eq('id', archivedTeam.id)

                          if (error) {
                            console.error(error)
                            alert(`Could not unarchive team: ${error.message}`)
                            return
                          }

                          await loadApp(archivedTeam.id)
                        }}>
                          Unarchive Team
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    )
  }
  function renderArchivedTeamView() {
    if (!archivedViewTeam) return null

    const archivedCompletedGames = archivedViewGames.filter((game) => game.status === 'Completed')

    const archivedGameIds = archivedCompletedGames.map((game) => game.id)
    const archivedEvents = gameEvents.filter((event) => archivedGameIds.includes(event.game_id))

    let wins = 0
    let losses = 0
    let draws = 0
    let goalsFor = 0
    let goalsAgainst = 0

    const archivedResults = archivedCompletedGames.map((game) => {
      const events = archivedEvents.filter((event) => event.game_id === game.id)
      const forGoals = events.filter((event) => event.event_type === 'our_goal').length
      const againstGoals = events.filter((event) => event.event_type === 'their_goal').length

      goalsFor += forGoals
      goalsAgainst += againstGoals

      let result = 'D'
      if (forGoals > againstGoals) {
        wins += 1
        result = 'W'
      } else if (forGoals < againstGoals) {
        losses += 1
        result = 'L'
      } else {
        draws += 1
      }

      return { game, forGoals, againstGoals, result }
    })

    return (
      <section className="team-card" style={{ maxWidth: '900px', margin: '24px auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <p className="eyebrow">ARCHIVED SEASON Ã¯Â¿Â½ READ ONLY</p>
            <h2 style={{ marginBottom: '6px' }}>{archivedViewTeam.name}</h2>
            <div style={{ color: '#666' }}>
              {archivedViewTeam.age_group} | {archivedViewTeam.format} | {archivedViewTeam.season}
            </div>
          </div>
          <button
            className="secondary-button"
            onClick={async () => { setArchivedViewTeam(null); await loadApp(); setScreen('home') }}
          >
            Back
          </button>
        </div>

        <div className="home-record-card" style={{ marginTop: '24px' }}>
          <div className="record-main">
            <p className="eyebrow">SEASON RECORD</p>
            <div className="home-record">{wins}-{losses}-{draws}</div>
            <span>W - L - D</span>
          </div>
          <div className="home-record-meta">
            <div><strong>{archivedCompletedGames.length}</strong><span>Games</span></div>
            <div><strong>{goalsFor}</strong><span>Goals For</span></div>
            <div><strong>{goalsAgainst}</strong><span>Goals Against</span></div>
          </div>
        </div>

        <div style={{ marginTop: '28px' }}>
          <h3>Game Results</h3>
          {archivedResults.length === 0 ? (
            <p style={{ color: '#666' }}>No completed games recorded for this season.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Opponent</th>
                    <th>Result</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {archivedResults.map(({ game, forGoals, againstGoals, result }) => (
                    <tr key={game.id}>
                      <td>{game.game_date || '-'}</td>
                      <td>{game.opponent || '-'}</td>
                      <td><strong>{result}</strong></td>
                      <td>{forGoals}-{againstGoals}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ marginTop: '28px' }}>
          <h3>Roster</h3>
          {archivedViewPlayers.length === 0 ? (
            <p style={{ color: '#666' }}>No players recorded for this season.</p>
          ) : (
            <div style={{ display: 'grid', gap: '8px' }}>
              {archivedViewPlayers.map((player) => (
                <div
                  key={player.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '10px 12px',
                    borderBottom: '1px solid #e5e7eb',
                  }}
                >
                  <span>
                    <strong>{player.name}</strong>
                  </span>
                  <span style={{ color: '#666' }}>
                    #{player.jersey_number ?? '-'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    )
  }
  function openNewTeamForm() {
    setShowJoinTeam(false)
    if (!newTeamCoachName.trim() && currentUserName.trim()) {
      setNewTeamCoachName(currentUserName.trim())
    }
    setShowNewTeamForm(true)
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0)
  }

  function openNewGameForm() {
    setShowJoinTeam(false)
    const today = localDateInputValue()
    setGameDate(today)
    setGameTime('')
    setOpponent('')
    setLocation('')
    setHomeAway('Home')
    setGameNotes('')
    setScreen('new-game')
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0)
  }

  function renderHome() {
    const nextGame = upcomingGames[0]

    return (
      <>
        <section className="welcome">
          <div className="home-team-identity">
            <p className="eyebrow">TEAM</p>
            <h2 className="home-team-name">{team?.name || 'Team'}</h2>
            <div style={{ marginTop: '4px', color: '#666', fontSize: '13px' }}>
              {[team?.city, team?.age_group, team?.format, team?.season].filter(Boolean).join(' · ')}
            </div>
            {currentUserRole === 'owner' && team?.join_code && (
              <div style={{ marginTop: '8px', fontSize: '13px' }}>
                <strong>Join Code:</strong> {team.join_code}
              </div>
            )}
            <div className="home-coaches">
              <span className="home-coaches-label">COACHES</span>
              <div className="home-coach-list">
                {staff.filter((member) => member.role === 'owner' || member.role === 'coach').sort((a, b) => Number(b.is_head_coach) - Number(a.is_head_coach)).map((member) => (
                  <span key={member.user_id} className="home-coach">
                    <strong>{member.full_name}</strong>
                    <span>{member.is_head_coach ? 'Head Coach' : member.role === 'owner' || member.role === 'coach' ? 'Assistant Coach' : ''}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div
            className="home-team-bar"
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '10px', width: '100%' }}
          >
            <label style={{ display: 'grid', gap: '6px', flex: '1 1 240px', minWidth: 0 }}>
              <span>Current Team</span>
              <select
                value={selectedTeamId}
                onChange={(e) => {
                  setSelectedTeamId(e.target.value)
                  setSelectedGame(null)
                  setLineup([])
                  setAllGameLineups([])
                  setGameAttendance({})
                }}
              >
                {teams.map((availableTeam) => (
                  <option key={availableTeam.id} value={availableTeam.id}>
                    {availableTeam.name} - {availableTeam.age_group} {availableTeam.format}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setShowJoinTeam(false)
                setJoinTeamResults([])
                openNewTeamForm()
              }}
              style={{ touchAction: 'manipulation', flex: '0 1 auto', maxWidth: '100%' }}
            >
              + New Team
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={async () => {
                setShowNewTeamForm(false)
                setShowJoinTeam(true)
                setJoinTeamSearch('')
                setJoinCodeSearch('')
                setJoinTeamResults([])
                await loadJoinRequests()
              }}
              style={{ touchAction: 'manipulation', flex: '0 1 auto', maxWidth: '100%' }}
            >
              Join Existing Team
            </button>
          </div>

          {showJoinTeam && (
            <div style={{ marginTop: '24px' }}>
              <h3>Join an Existing Team</h3>
              <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
                <input type="text" value={joinTeamSearch} onChange={(e) => setJoinTeamSearch(e.target.value)} placeholder="Search team, city, or coach" />
                <input type="text" value={joinCodeSearch} onChange={(e) => setJoinCodeSearch(e.target.value.toUpperCase())} placeholder="Or enter exact Join Code" maxLength={6} autoCapitalize="characters" />
                <button className="secondary-button" onClick={searchTeamsToJoin} disabled={!joinTeamSearch.trim() && !joinCodeSearch.trim()}>Search Teams</button>
              </div>
              {joinTeamResults.map((teamToJoin) => {
                const alreadyMember = teams.some((memberTeam) => memberTeam.id === teamToJoin.id)
                const requestPending = joinRequestTeamIds.includes(teamToJoin.id)

                return (
                  <div key={teamToJoin.id} className="team-card" style={{ marginTop: '12px', padding: '14px' }}>
                    <strong>{teamToJoin.name}</strong>
                    <div style={{ marginTop: '6px', color: '#666', fontSize: '13px' }}>
                      {[teamToJoin.city, teamToJoin.coach_name, teamToJoin.age_group, teamToJoin.format, teamToJoin.season].filter(Boolean).join(' · ')}
                    </div>
                    {alreadyMember ? (
                      <button type="button" className="secondary-button" style={{ marginTop: '12px' }} disabled>
                        You&apos;re Already on This Team
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={requestPending ? 'secondary-button' : 'primary-button'}
                        style={{ marginTop: '12px', touchAction: 'manipulation' }}
                        onClick={() => void requestToJoinTeam(teamToJoin)}
                        disabled={requestPending}
                      >
                        {requestPending ? 'Request Sent' : 'Request to Join'}
                      </button>
                    )}
                  </div>
                )
              })}
              {(joinTeamSearch.trim() || joinCodeSearch.trim()) && joinTeamResults.length === 0 && <p style={{ marginTop: '10px', color: '#666' }}>No active teams found.</p>}
            </div>
          )}
        </section>

        <section className="home-next-game">
          <div className="section-header">
            <div>
              <p className="eyebrow">UP NEXT</p>
              <h2>{nextGame ? `vs. ${nextGame.opponent}` : 'No upcoming game'}</h2>
            </div>
            {nextGame && <span>{nextGame.game_date}{nextGame.game_time ? ` - ${formatGameTime(nextGame.game_time)}` : ''}</span>}
          </div>
          {nextGame ? (
            <>
              {nextGame.location && <p className="next-game-location">{nextGame.location}</p>}
              <div className="home-action-row">
                <button className="primary-button" onClick={() => openLineup(nextGame)}>Build Lineup</button>
                <button onClick={async () => { await openLineup(nextGame); setScreen('live-game') }}>Live Game</button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="primary-button"
              onClick={openNewGameForm}
              onTouchEnd={(event) => {
                event.preventDefault()
                openNewGameForm()
              }}
            >
              + Schedule Game
            </button>
          )}
        </section>

        <section className="home-record-card">
          <div className="record-main">
            <p className="eyebrow">SEASON RECORD</p>
            <div className="home-record">{teamRecord.wins}-{teamRecord.losses}-{teamRecord.draws}</div>
            <span>W - L - D</span>
          </div>
          <div className="home-record-meta">
            <div><strong>{teamRecord.gamesPlayed}</strong><span>Games</span></div>
            <div><strong>{teamRecord.winPct}%</strong><span>Win Rate</span></div>
            <div><strong>{teamRecord.goalsFor}</strong><span>Goals For</span></div>
            <div><strong>{teamRecord.goalsAgainst}</strong><span>Goals Against</span></div>
          </div>
        </section>



        <div className="quick-actions home-quick-actions">
          <button onClick={() => setScreen('roster')}>Roster</button>
          <button
            type="button"
            onClick={openNewGameForm}
            onTouchEnd={(event) => {
              event.preventDefault()
              openNewGameForm()
            }}
          >
            + New Game
          </button>
          <button onClick={() => nextGame ? openLineup(nextGame) : setScreen('new-game')}>Build Lineup</button>
          {currentUserRole === 'owner' && (
            <button onClick={() => setScreen('team-rules')}>Team Rules</button>
          )}
          <button
              type="button"
              onPointerDown={async (e) => {
                e.preventDefault()
                setScreen('coaches')
                window.scrollTo(0, 0)
                await loadOwnerJoinRequests()
              }}
            >
              Coaches & Staff
            </button>
        </div>

        <section className="team-card home-team-summary">
          <div>
            <p className="eyebrow">CURRENT TEAM</p>
            <h2>{team?.name}</h2>
            <p>{team?.age_group} - {team?.format} - {team?.season}</p>
          </div>
          <strong>{players.length} players</strong>
        </section>

        <section className="team-card home-season-analytics">
          <div className="section-header">
            <div><h2>Season Analytics</h2><span>Quick view of the season so far.</span></div>
          </div>
          <div className="season-stat-grid">
            <div><strong>{teamRecord.gamesPlayed}</strong><span>Games</span></div>
            <div><strong>{teamRecord.winPct}%</strong><span>Win Rate</span></div>
            <div><strong>{teamRecord.goalsFor}</strong><span>Goals For</span></div>
            <div><strong>{teamRecord.goalsAgainst}</strong><span>Goals Against</span></div>
          </div>
          {topScorers.length > 0 && (
            <div className="top-scorers">
              <div className="subsection-title">Top Scorers</div>
              {topScorers.map(({ player, goals }, index) => (
                <div className="top-scorer-row" key={player!.id}>
                  <span><b>{index + 1}</b> #{player!.jersey_number ?? '-'} {player!.name}</span>
                  <strong>{goals}</strong>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="team-card player-analytics-card">
          <div className="section-header">
            <div><h2>Player Analytics</h2><span>Quarter-by-quarter position usage this season.</span></div>
          </div>
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead><tr>
                <th className="player-col" onClick={() => handleAnalyticsSort('player')}>Player</th>
                <th onClick={() => handleAnalyticsSort('played')}>QTRS<br /><span>Played</span></th>
                <th onClick={() => handleAnalyticsSort('gk')}>GK<br /><span>Qtrs</span></th>
                <th>DEF<br /><span>Qtrs</span></th>
                <th>MID<br /><span>Qtrs</span></th>
                <th onClick={() => handleAnalyticsSort('str')}>STR<br /><span>Qtrs</span></th>
                <th onClick={() => handleAnalyticsSort('bench')}>Bench<br /><span>Qtrs</span></th>
                <th onClick={() => handleAnalyticsSort('goals')}>Goals</th>
                <th onClick={() => handleAnalyticsSort('assists')}>Assists</th>
                <th onClick={() => handleAnalyticsSort('shots')}>Shots</th>
                <th onClick={() => handleAnalyticsSort('saves')}>Saves</th>
                <th onClick={() => handleAnalyticsSort('captain')}>Captain<br /><span>Gms</span></th>
              </tr></thead>
              <tbody>
                {[...players]
                  .sort((a, b) => {
                    const aValue = analyticsSortValue(a)
                    const bValue = analyticsSortValue(b)

                    if (typeof aValue === 'string' && typeof bValue === 'string') {
                      const result = aValue.localeCompare(bValue)
                      return analyticsSortAsc ? result : -result
                    }

                    const result = Number(bValue) - Number(aValue)
                    return analyticsSortAsc ? -result : result
                  })
                  .map((player) => {
                  const usage = completedPositionAnalytics.get(player.id) || {
                    played: 0,
                    gk: 0,
                    def: 0,
                    mid: 0,
                    str: 0,
                    bench: 0,
                  }

                  const roleCounts = {
                    GK: usage.gk,
                    DEF: usage.def,
                    MID: usage.mid,
                    STR: usage.str,
                  }

                  const played = usage.played
                  const bench = usage.bench

                  const goals = completedGameEvents.filter(
                    (event) =>
                      event.event_type === 'our_goal' &&
                      event.player_id === player.id
                  ).length

                  const assists = completedGameEvents.filter(
                    (event) =>
                      event.event_type === 'our_goal' &&
                      event.assister_id === player.id
                  ).length

                  const shots = completedGameEvents.filter((event) => event.event_type === 'our_shot' && event.player_id === player.id).length
                  const saves = completedGameEvents.filter((event) => event.event_type === 'save' && event.player_id === player.id).length

                  const captainCount = completedGames.filter(
                    (game) =>
                      game.captain_1_id === player.id ||
                      game.captain_2_id === player.id
                  ).length

                  return (
                    <tr key={player.id}>
                      <td className="player-col" style={{ fontWeight: 700 }}>
                        #{player.jersey_number ?? '-'} {player.first_name || player.name.split(' ')[0]}
                      </td>
                      <td>{played % 1 === 0 ? played : played.toFixed(1)}</td>
                      <td>{roleCounts.GK % 1 === 0 ? roleCounts.GK : roleCounts.GK.toFixed(1)}</td>
                      <td>{roleCounts.DEF % 1 === 0 ? roleCounts.DEF : roleCounts.DEF.toFixed(1)}</td>
                      <td>{roleCounts.MID % 1 === 0 ? roleCounts.MID : roleCounts.MID.toFixed(1)}</td>
                      <td>{roleCounts.STR % 1 === 0 ? roleCounts.STR : roleCounts.STR.toFixed(1)}</td>
                      <td>{bench % 1 === 0 ? bench : bench.toFixed(1)}</td>
                      <td>{goals}</td>
                      <td>{assists}</td>
                      <td>{shots}</td>
                      <td>{saves}</td>
                      <td>{captainCount}</td>
                    </tr>
                  )
                })}              </tbody>
            </table>
          </div>
        </section>
          {currentUserRole === 'owner' && archivedTeams.length > 0 && (
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', opacity: 0.65 }}>
                Archived Teams
              </div>
              {archivedTeams.map((archivedTeam) => (
                <div key={archivedTeam.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '8px 0' }}>
                  <span>
                    <strong>{archivedTeam.name}</strong>
                    <span style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.7 }}>
                      {archivedTeam.age_group} | {archivedTeam.format} | {archivedTeam.season}
                    </span>
                  </span>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button className="secondary-button" onClick={() => viewArchivedTeam(archivedTeam)}>
                      View Season
                    </button>
                    {currentUserRole === 'owner' && (
                      <button className="secondary-button" onClick={async () => {
                        const { error } = await supabase
                          .from('teams')
                          .update({ archived: false })
                          .eq('id', archivedTeam.id)

                        if (error) {
                          console.error(error)
                          alert(`Could not unarchive team: ${error.message}`)
                          return
                        }

                        await loadApp(archivedTeam.id)
                      }}>
                        Unarchive
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
      </>
    )
  }

  function renderRoster() {
    return (
      <>
        <button
          className="back-button"
          onClick={() => setScreen(helpReturnScreen)}
        >
           Back
        </button>

        <section className="team-card">
          <div className="section-header">
            <div>
              <h2>Roster</h2>
              <span>{players.length} players</span>
            </div>
          </div>

          {!editingPlayerId && (
            <div className="add-player-form">
              <input type="text" placeholder="First name" value={newPlayerFirstName} onChange={(e) => setNewPlayerFirstName(e.target.value)} />
              <input type="text" placeholder="Last name (optional)" value={newPlayerLastName} onChange={(e) => setNewPlayerLastName(e.target.value)} />
              <input type="number" placeholder="Jersey number" value={newPlayerNumber} onChange={(e) => setNewPlayerNumber(e.target.value)} />
              <div className="form-buttons"><button className="primary-button" onClick={addOrUpdatePlayer}>Add Player</button></div>
            </div>
          )}

          <div className="roster-list">
            {players.map((player) => (
              <div
                className="roster-player"
                key={player.id}
                style={{ alignItems: 'center' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <div
                    aria-hidden="true"
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      flex: '0 0 42px',
                      fontWeight: 800,
                      fontSize: '15px',
                      background: '#eef2f7',
                      border: '2px solid #cbd5e1',
                    }}
                  >
                    {player.jersey_number ?? ''}
                  </div>

                  <div style={{ minWidth: 0, flex: 1 }}>
                    {editingPlayerId === player.id ? (
                      <div className="inline-player-editor">
                        <div className="inline-player-fields">
                          <input aria-label="First name" placeholder="First name" value={newPlayerFirstName} onChange={(e) => setNewPlayerFirstName(e.target.value)} />
                          <input aria-label="Last name" placeholder="Last name" value={newPlayerLastName} onChange={(e) => setNewPlayerLastName(e.target.value)} />
                          <input aria-label="Jersey number" type="number" placeholder="#" value={newPlayerNumber} onChange={(e) => setNewPlayerNumber(e.target.value)} />
                        </div>
                        <div className="roster-actions">
                          <button className="primary-button" onClick={addOrUpdatePlayer}>Save</button>
                          <button className="secondary-button" onClick={() => { setEditingPlayerId(null); setNewPlayerFirstName(''); setNewPlayerLastName(''); setNewPlayerNumber('') }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <strong style={{ display: 'block', fontSize: '15px' }}>{[player.first_name, player.last_name].filter(Boolean).join(' ') || player.name}</strong>
                        <div className="roster-actions">
                          <button className="secondary-button" onClick={() => editPlayer(player)}>Edit</button>
                          <button className="secondary-button" onClick={() => deletePlayer(player)}>Delete</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <section style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #ddd' }}>
            <div className="section-header">
              <div>
                <h2>Coach Knowledge</h2>
                <span>Tell the app what you know now. Game history will add evidence later.</span>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '10px', marginTop: '10px' }}>
              {players.map((player) => {
                const priority = player.usage_priority || 'Regular'
                const tolerance = player.bench_tolerance || 'Normal'
                const prefs = player.position_preferences || {}
                const avoid = player.avoid_positions || []
                const open = coachProfilePlayerId === player.id
                const draft = open && coachDraft?.playerId === player.id ? coachDraft : null

                const startEdit = () => {
                  setCoachProfilePlayerId(player.id)
                  setCoachDraft({
                    playerId: player.id,
                    usage_priority: priority,
                    bench_tolerance: tolerance,
                    position_preferences: { ...prefs },
                    avoid_positions: [...avoid],
                    coach_notes: player.coach_notes || '',
                  })                }

                const cancelEdit = () => {
                  setCoachProfilePlayerId(null)
                  setCoachDraft(null)
                }

                return (
                  <div key={player.id} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                      <strong>#{player.jersey_number ?? '-'} {player.first_name || player.name.split(' ')[0]}</strong>
                      <button onClick={open ? cancelEdit : startEdit}>
                        {open ? 'Close' : 'Edit Coach Input'}
                      </button>
                    </div>

                    {open && draft && (
                      <div style={{ display: 'grid', gap: '10px', marginTop: '10px' }}>
                        <label>
                          Usage Priority
                          <select
                            value={draft.usage_priority}
                            onChange={(e) => setCoachDraft({ ...draft, usage_priority: e.target.value as NonNullable<Player['usage_priority']> })}
                            style={{ width: '100%' }}
                          >
                            <option>Core</option>
                            <option>Regular</option>
                            <option>Development</option>
                            <option>Situational</option>
                            <option>Limited</option>
                          </select>
                        </label>

                        <label>
                          Bench Tolerance
                          <select
                            value={draft.bench_tolerance}
                            onChange={(e) => setCoachDraft({ ...draft, bench_tolerance: e.target.value as NonNullable<Player['bench_tolerance']> })}
                            style={{ width: '100%' }}
                          >
                            <option>Minimal</option>
                            <option>Normal</option>
                            <option>Flexible</option>
                          </select>
                        </label>

                        <div>
                          <strong>Role Strength</strong>
                          <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '3px', marginBottom: '6px' }}>1 = weak fit, 5 = excellent fit</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px', marginTop: '8px' }}>
                            {['GK', 'DEF', 'MID', 'STR'].map((role) => (
                              <label key={role} style={{ display: 'contents' }}>
                                <span style={{ alignSelf: 'center', fontWeight: 600 }}>{role}</span>
                                <select
                                  aria-label={`${role} strength`}
                                  style={{ width: '100%', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}
                                  value={String(draft.position_preferences[role] || 0)}
                                  onChange={(e) => setCoachDraft({
                                    ...draft,
                                    position_preferences: { ...draft.position_preferences, [role]: Number(e.target.value) },
                                  })}
                                >
                                  <option value="0">Not rated</option>
                                  <option value="1">1 - Weak</option>
                                  <option value="2">2</option>
                                  <option value="3">3 - Solid</option>
                                  <option value="4">4</option>
                                  <option value="5">5 - Excellent</option>
                                </select>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div>
                          <strong>Avoid Roles</strong>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                            {['GK', 'DEF', 'MID', 'STR'].map((role) => {
                              const checked = draft.avoid_positions.includes(role)
                              return (
                                <label key={role} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '7px 9px', border: '1px solid #ddd', borderRadius: '6px' }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => setCoachDraft({
                                      ...draft,
                                      avoid_positions: e.target.checked
                                        ? [...draft.avoid_positions, role]
                                        : draft.avoid_positions.filter((item) => item !== role),
                                    })}
                                  />
                                  <span>{role}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>

                        <textarea
                          value={draft.coach_notes}
                          onChange={(e) => setCoachDraft({ ...draft, coach_notes: e.target.value })}
                          placeholder="Coach notes: fast, strong left foot, good under pressure, etc."
                          rows={3}
                        />

                        <div className="form-buttons">
                          <button
                            className="primary-button"
                            onClick={async () => {
                              await saveCoachProfile(player, {
                                usage_priority: draft.usage_priority,
                                bench_tolerance: draft.bench_tolerance,
                                position_preferences: draft.position_preferences,
                                avoid_positions: draft.avoid_positions,
                                coach_notes: draft.coach_notes,
                              })
                              setCoachDraft(null)
                            }}
                          >
                            Save Coach Knowledge
                          </button>
                          <button className="secondary-button" onClick={cancelEdit}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        </section>
      </>
    )
  }

  function renderNewGame() {
    return (
      <>
        <button
          className="back-button"
          onClick={() => setScreen('home')}
        >
           Back
        </button>

        <section className="team-card">
          <div className="section-header">
            <div>
              <h2>{editingGameId ? 'Edit Game' : 'New Game'}</h2>
              <span>
                {editingGameId ? 'Update the game details.' : 'Create a game and build the lineup.'}
              </span>
            </div>
          </div>

          <div className="add-player-form">
            <input
              type="text"
              placeholder="Opponent"
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
            />

            <div className="game-date-time-grid">
              <label>
                <span>Game Date</span>
                {editingGameId ? (
                  <input
                    type="date"
                    aria-label="Game Date"
                    value={gameDate}
                    onChange={(e) => setGameDate(e.target.value)}
                  />
                ) : (
                  <select
                    aria-label="Game Date"
                    value={gameDate}
                    onChange={(e) => {
                      setGameDate(e.target.value)
                    }}
                  >
                    {buildGameDateOptions().map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                )}
              </label>

              <label>
                <span>Game Time</span>
                <select
                  aria-label="Game Time"
                  value={gameTime}
                  onChange={(e) => {
                    setGameTime(e.target.value)
                  }}
                >
                  <option value="">Select time</option>
                  {buildGameTimeOptions().map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <input
              type="text"
              placeholder="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />

            <select
              value={homeAway}
              onChange={(e) => setHomeAway(e.target.value)}
            >
              <option value="Home">Home</option>
              <option value="Away">Away</option>
            </select>

            <input
              type="text"
              placeholder="Notes"
              value={gameNotes}
              onChange={(e) => setGameNotes(e.target.value)}
            />

            <button
              className="primary-button"
              onClick={editingGameId ? updateGame : createGame}
            >
              {editingGameId ? 'Save Changes' : 'Create Game'}
            </button>

            {editingGameId && (
              <button
                className="secondary-button"
                onClick={() => {
                  setEditingGameId(null)
                  setOpponent('')
                  setGameDate(localDateInputValue())
                  setGameTime('')
                  setLocation('')
                  setHomeAway('Home')
                  setGameNotes('')
                  setScreen('games')
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </section>
      </>
    )
  }

  function renderPlayingTimeTracker() {
    const plannedQuarters = [1, 2, 3, 4].filter((quarter) =>
      quarterHasLineup(quarter)
    )

    if (plannedQuarters.length === 0) return null

    return (
      <section className="team-card">
        <div className="section-header">
          <div>
            <h2>Position History</h2>
            <span>
              Where everyone has played so far.
            </span>
          </div>
        </div>

        <div
          style={{
            overflowX: 'auto',
            marginTop: '12px',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              minWidth: '420px',
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '8px 6px',
                    width: '150px',
                    minWidth: '150px',
                    maxWidth: '150px',
                    position: 'sticky',
                    left: 0,
                    zIndex: 2,
                    background: '#fff',
                    boxShadow: '2px 0 4px rgba(0,0,0,0.06)',
                  }}
                >
                  Player
                </th>

                {plannedQuarters.map((quarter) => (
                  <th
                    key={quarter}
                    style={{
                      textAlign: 'center',
                      padding: '8px 4px',
                    }}
                  >
                    Q{quarter}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {players.map((player) => (
                <tr key={player.id}>
                  <td
                    style={{
                      padding: '8px 6px',
                      width: '150px',
                      minWidth: '150px',
                      maxWidth: '150px',
                      fontWeight: 600,
                      position: 'sticky',
                      left: 0,
                      zIndex: 1,
                      background: '#fff',
                      boxShadow: '2px 0 4px rgba(0,0,0,0.06)',
                    }}
                  >
                    {player.jersey_number !== null
                      ? `#${player.jersey_number} `
                      : ''}
                    {player.first_name || player.name.split(' ')[0]}
                  </td>

                  {plannedQuarters.map((quarter) => {
                    const assignment =
                      playerQuarterAssignment(
                        player.id,
                        quarter
                      )

                    return (
                      <td
                        key={quarter}
                        style={{
                          textAlign: 'center',
                          padding: '8px 4px',
                          fontSize: '12px',
                        }}
                      >
                        {assignment
                          ? assignment.position === 'Goalkeeper'
                            ? <strong>GK</strong>
                            : assignment.position
                                .replace('Left Defense', 'LD')
                                .replace('Center Defense', 'CD')
                                .replace('Right Defense', 'RD')
                                .replace('Center Mid', 'CM')
                                .replace('Left Striker', 'LS')
                                .replace('Right Striker', 'RS')
                          : <strong>Bench</strong>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    )
  }

  function renderGames() {
    const gameSortKey = (game: Game) =>
      `${game.game_date}T${game.game_time || '23:59:59'}`

    const upcoming = games
      .filter((game) => game.status !== 'Completed')
      .sort((a, b) => gameSortKey(a).localeCompare(gameSortKey(b)))

    const completed = games
      .filter((game) => game.status === 'Completed')
      .sort((a, b) => gameSortKey(b).localeCompare(gameSortKey(a)))

    const renderGame = (game: Game) => (
      <div
        key={game.id}
        style={{
          padding: '14px 0',
          borderBottom: '1px solid #eee',
        }}
      >
        <strong>{game.home_away === 'Away' ? 'at' : 'vs.'} {game.opponent}</strong>

        <div style={{ marginTop: 4, fontSize: 13 }}>
          {game.game_date}
          {game.game_time ? `  ${formatGameTime(game.game_time)}` : ''}
        </div>

        <div style={{ marginTop: 4, fontSize: 13 }}>
          {game.status}
        </div>

        <div
          style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            marginTop: '8px',
          }}
        >
          <button
            onClick={() => {
              setSelectedGame(game)
              setScreen('live-game')
            }}
          >
            {game.status === 'Completed' ? 'View Game' : 'Live Game'}
          </button>

          {game.status !== 'Completed' && (
            <button onClick={() => openLineup(game)}>Lineup</button>
          )}

          {currentUserRole !== 'viewer' && (
            <button
              className="secondary-button"
              onClick={() => startEditGame(game)}
            >
              Edit Game
            </button>
          )}

          {currentUserRole !== 'viewer' && (
            <button
              className="secondary-button"
              onClick={() => resetGame(game)}
            >
              Reset Game
            </button>
          )}
        </div>
      </div>
    )

    return (
      <>
        <button
          className="back-button"
          onClick={() => setScreen(helpReturnScreen)}
        >
          Back
        </button>

        <section className="team-card">
          <div className="section-header">
            <div>
              <h2>Games</h2>
              <span>{games.length} games</span>
            </div>
            <button
              className="primary-button"
              onClick={() => setScreen('new-game')}
            >
              + Schedule New Game
            </button>
          </div>

          {games.length === 0 ? (
            <p>No games yet.</p>
          ) : (
            <>
              {upcoming.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ margin: '0 0 8px' }}>Upcoming</h3>
                  {upcoming.map(renderGame)}
                </div>
              )}

              {completed.length > 0 && (
                <div>
                  <h3 style={{ margin: '0 0 8px' }}>Completed</h3>
                  {completed.map(renderGame)}
                </div>
              )}
            </>
          )}
        </section>
      </>
    )
  }

  function renderLiveGame() {
    if (!selectedGame) return null

    return (
      <LiveGame
        gameId={selectedGame.id}
        opponent={selectedGame.opponent}
        players={players}
        lineups={allGameLineups}
        captainIds={[selectedGame.captain_1_id, selectedGame.captain_2_id].filter(Boolean) as string[]}
        userRole={currentUserRole || 'viewer'}
        onBack={() => { setScreen('home'); void loadApp(selectedTeamId, false) }}
      />
    )
  }

  async function saveCaptains() {
    if (!selectedGame) return

    if (!captain1Id || !captain2Id) {
      alert('Select two captains.')
      return
    }

    if (captain1Id === captain2Id) {
      alert('Choose two different captains.')
      return
    }

    const { error } = await supabase
      .from('games')
      .update({ captain_1_id: captain1Id, captain_2_id: captain2Id })
      .eq('id', selectedGame.id)

    if (error) {
      console.error(error)
      alert('Could not save captains.')
      return
    }

    setSelectedGame((current) =>
      current ? { ...current, captain_1_id: captain1Id, captain_2_id: captain2Id } : current
    )

    setGames((current) =>
      current.map((game) =>
        game.id === selectedGame.id
          ? { ...game, captain_1_id: captain1Id, captain_2_id: captain2Id }
          : game
      )
    )

    alert('Captains saved.')
  }

  async function saveLineupData(items: LineupItem[], quarter: number, announceSuccess = true) {
    if (!selectedGame) return false

    // Validate lineup data before sending anything to Supabase.
    // player_id MUST be an actual player UUID; position is the position string.
    const validRows = items
      .filter((item) => {
        const player = players.find((p) => p.id === item.player_id)
        const validPosition = typeof item.position === 'string' && item.position.length > 0

        if (!player || !validPosition) {
          console.warn('Skipping invalid lineup item:', item)
          return false
        }

        return true
      })
      .map((item) => ({
        game_id: selectedGame.id,
        quarter,
        player_id: item.player_id,
        position: item.position,
      }))

    // If the UI somehow created a malformed lineup, stop before deleting
    // the existing saved lineup so we never destroy good data.
    if (validRows.length !== items.length) {
      console.error('Invalid lineup data:', items)
      alert('Could not save lineup: one or more player assignments are invalid. Please reassign the affected position.')
      return false
    }

    const { error: deleteError } = await supabase
      .from('game_lineups')
      .delete()
      .eq('game_id', selectedGame.id)
      .eq('quarter', quarter)

    if (deleteError) {
      console.error(deleteError)
      alert(`Could not save lineup: ${deleteError.message}`)
      return false
    }

    if (validRows.length > 0) {
      const { error: insertError } = await supabase
        .from('game_lineups')
        .insert(validRows)

      if (insertError) {
        console.error(insertError)
        alert(`Could not save lineup: ${insertError.message}`)
        return false
      }
    }

    const { data: refreshedLineups, error: refreshError } = await supabase
      .from('game_lineups')
      .select('player_id, quarter, position')
      .eq('game_id', selectedGame.id)

    if (refreshError) {
      console.error(refreshError)
      alert('Lineup saved, but the usage display could not be refreshed.')
      return false
    }

    const refreshed = (refreshedLineups || []) as LineupItem[]
    setAllGameLineups(refreshed)
    setLineup(refreshed.filter((item) => item.quarter === selectedQuarter))

    if (announceSuccess) {
      alert(`Q${quarter} lineup saved successfully.`)
    }
    return true
  }

  async function saveLineup() {
    return saveLineupData(lineup, selectedQuarter, true)
  }
function renderLineup() {
    if (!selectedGame) return null

    const canManageGame = currentUserRole === 'owner' || currentUserRole === 'coach'

    const getPlayerDisplayName = (p: any) => {
      if (!p) return ''
      if (p.first_name) return `${p.first_name}`
      return p.name || 'Player'
    }

    return (
      <div style={{ background: '#090d12', color: '#e5e7eb', minHeight: '100vh', padding: '16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        
        {/* Top App / Squad Status Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>⚽</div>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#4edea3', textTransform: 'uppercase', letterSpacing: '0.5px' }}>U17 PREMIER • LIVE Q2</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ background: '#111827', border: '1px solid #1f2937', padding: '6px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, color: '#f3f4f6' }}>⏱️ 24:18</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#10b981', color: '#064e3b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '14px' }}>👤</div>
          </div>
        </div>

        {/* Action Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#fff', margin: 0 }}>Lineup Builder</h1>
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '4px 0 0 0' }}>Shape your squad, own every quarter</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                if (typeof (window as any).openCoachAssist === 'function') (window as any).openCoachAssist()
                else alert('Coach Assist initialized.')
              }}
              style={{ background: '#111827', border: '1px solid #1f2937', color: '#38bdf8', borderRadius: '10px', padding: '8px 12px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
            >
              ✨ Coach Assist
            </button>
            <button
              type="button"
              onClick={() => saveLineup()}
              disabled={savingLineup || !canManageGame}
              style={{ background: '#10b981', color: '#022c22', border: 'none', borderRadius: '10px', padding: '8px 14px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              ✓ {savingLineup ? 'Saving...' : 'Save Lineup'}
            </button>
          </div>
        </div>

        {/* Game Info & Optimizer Pill Bar */}
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '12px', padding: '10px 12px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#d1d5db' }}>
            <span style={{ background: '#1f2937', color: '#4edea3', fontWeight: 800, fontSize: '10px', padding: '2px 6px', borderRadius: '4px' }}>7v7</span>
            <span>⚽ Vs. {selectedGame.opponent} • {selectedGame.game_date} {selectedGame.game_time ? formatGameTime(selectedGame.game_time) : ''}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#6b7280' }}>Field C2</span>
            <button
              type="button"
              onClick={() => {
                if (typeof (window as any).optimizeCurrentQuarter === 'function') (window as any).optimizeCurrentQuarter()
                else alert('Optimizing lineup based on playing time targets...')
              }}
              disabled={!canManageGame}
              style={{ background: 'rgba(14, 116, 144, 0.2)', border: '1px solid #0891b2', color: '#22d3ee', padding: '4px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              ⚡ Optimize Lineup
            </button>
          </div>
        </div>

        {/* Quarter Selection Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px', marginBottom: '16px' }}>
          {[1, 2, 3, 4].map((q) => {
            const count = allGameLineups.filter((item) => item.quarter === q).length
            const isActive = selectedQuarter === q
            return (
              <button
                key={q}
                type="button"
                onClick={() => void changeQuarter(q)}
                style={{
                  background: isActive ? '#10b981' : '#111827',
                  border: isActive ? '2px solid #34d399' : '1px solid #1f2937',
                  borderRadius: '12px',
                  padding: '10px 6px',
                  color: isActive ? '#022c22' : '#9ca3af',
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 900 }}>Q{q} {isActive && '•'}</div>
                <div style={{ fontSize: '9px', fontWeight: 800, marginTop: '2px', opacity: 0.9 }}>{count}/7 SET</div>
              </button>
            )
          })}
        </div>

        {/* Formation & Captain Pickers */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <select
            value={optimizationFormation}
            onChange={(e) => setOptimizationFormation(e.target.value)}
            style={{ background: '#111827', border: '1px solid #1f2937', color: '#f3f4f6', padding: '8px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, flex: 1 }}
          >
            <option value="3-1-2">FORM 3-1-2</option>
            <option value="2-3-1">FORM 2-3-1</option>
            <option value="3-2-1">FORM 3-2-1</option>
          </select>
          <div style={{ background: '#111827', border: '1px solid #1f2937', padding: '8px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, color: '#f3f4f6', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: '#f59e0b', fontWeight: 900 }}>©</span> #2 Logan
          </div>
          <div style={{ background: '#111827', border: '1px solid #1f2937', padding: '8px 12px', borderRadius: '10px', fontSize: '12px', fontWeight: 700, color: '#f3f4f6', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: '#f59e0b', fontWeight: 900 }}>©</span> #7 Gordon
          </div>
        </div>

        {/* Realistic Tactical Pitch (Dark Pitch Grass with Field Lines) */}
        <div style={{
          position: 'relative',
          borderRadius: '16px',
          padding: '20px 12px',
          background: 'radial-gradient(circle at center, #064e3b 0%, #022c22 100%)',
          border: '2px solid #059669',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
          marginBottom: '20px',
          overflow: 'hidden',
        }}>
          {/* Soccer Field Line Markings */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, border: '1px solid rgba(52, 211, 153, 0.25)', margin: '10px', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '50%', left: '10px', right: '10px', height: '1px', background: 'rgba(52, 211, 153, 0.25)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '70px', height: '70px', border: '1px solid rgba(52, 211, 153, 0.25)', borderRadius: '50%', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: '10px', left: '25%', right: '25%', height: '35px', border: '1px solid rgba(52, 211, 153, 0.25)', borderBottom: 'none', pointerEvents: 'none' }} />

          {/* Pitch Badge Headers */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', position: 'relative', zIndex: 2 }}>
            <span style={{ fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px' }}>✈ ATTACKING DIRECTION</span>
            <span style={{ background: 'rgba(0,0,0,0.4)', color: '#4edea3', border: '1px solid #059669', padding: '3px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 800 }}>• {optimizationFormation} Formation</span>
          </div>

          {/* Pitch Grid Rows */}
          <div style={{ display: 'grid', gap: '20px', position: 'relative', zIndex: 2 }}>
            {(formationRows[optimizationFormation] || []).map((row, rowIndex) => (
              <div key={rowIndex} style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
                {row.map((position) => {
                  const assignment = playerAtPosition(position)
                  const player = assignment ? players.find((p) => p.id === assignment.player_id) : null
                  const isGK = position === 'Goalkeeper'
                  const isCaptain = player && (player.jersey_number === 2 || player.jersey_number === 7)

                  return (
                    <button
                      key={position}
                      type="button"
                      onClick={() => setSelectedPreplanPlayerId(assignment?.player_id || `__empty__:${position}`)}
                      disabled={!canManageGame}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        cursor: canManageGame ? 'pointer' : 'default',
                        padding: 0,
                      }}
                    >
                      {/* Circular Jersey Badge */}
                      <div style={{ position: 'relative' }}>
                        {isCaptain && (
                          <div style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#f59e0b', color: '#000', fontSize: '8px', fontWeight: 900, width: '14px', height: '14px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}>C</div>
                        )}
                        <div style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '50%',
                          background: isGK ? 'radial-gradient(circle, #f59e0b 0%, #b45309 100%)' : 'radial-gradient(circle, #1f2937 0%, #111827 100%)',
                          border: isGK ? '2px solid #fcd34d' : '2px solid #34d399',
                          boxShadow: isGK ? '0 0 10px rgba(245, 158, 11, 0.4)' : '0 0 10px rgba(52, 211, 153, 0.3)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                        }}>
                          <span style={{ fontSize: '13px', fontWeight: 900, lineHeight: 1 }}>{player?.jersey_number ?? '?'}</span>
                          <span style={{ fontSize: '8px', fontWeight: 800, color: isGK ? '#fef3c7' : '#9ca3af', marginTop: '1px' }}>{positionShort(position)}</span>
                        </div>
                      </div>

                      {/* Name Pill Tag */}
                      <div style={{
                        marginTop: '4px',
                        background: 'rgba(0, 0, 0, 0.75)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#fff',
                        whiteSpace: 'nowrap',
                      }}>
                        {player ? getPlayerDisplayName(player) : 'Unassigned'}
                      </div>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Available Subs Section */}
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '14px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#38bdf8' }}>🏃</span>
              <strong style={{ fontSize: '13px', color: '#fff' }}>Available Subs</strong>
            </div>
            <span style={{ background: '#1f2937', color: '#9ca3af', fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '10px' }}>
              {players.filter((p) => !lineup.some((item) => item.player_id === p.id)).length} RESTING
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
            {players.filter((p) => !lineup.some((item) => item.player_id === p.id)).map((player) => {
              const isLowMinutes = player.jersey_number === 5 // Highlighting resting needs
              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => setSelectedPreplanPlayerId(player.id)}
                  disabled={!canManageGame}
                  style={{
                    background: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '10px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: canManageGame ? 'pointer' : 'default',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#374151', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 800 }}>
                      {player.jersey_number ?? '-'}
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>{getPlayerDisplayName(player)}</div>
                      <div style={{ fontSize: '9px', color: isLowMinutes ? '#f87171' : '#9ca3af', fontWeight: 700 }}>
                        {isLowMinutes ? 'Needs min.' : 'Att / Mid'}
                      </div>
                    </div>
                  </div>
                  <span style={{ color: '#38bdf8', fontSize: '12px' }}>⇅</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Playing Time Distribution Progress Bars */}
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '14px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>⏱️</span>
              <strong style={{ fontSize: '13px', color: '#fff' }}>Playing Time Distribution</strong>
            </div>
            <span style={{ background: '#1f2937', color: '#9ca3af', fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>USSF 50% RULE</span>
          </div>

          <div style={{ display: 'grid', gap: '10px' }}>
            {players.map((player) => {
              const assignedQuarters = [1, 2, 3, 4].map((q) => {
                const source = q === selectedQuarter ? lineup : allGameLineups.filter((item) => item.quarter === q)
                return source.find((item) => item.player_id === player.id)
              })
              const totalPlayed = assignedQuarters.filter(Boolean).length
              const playedGK = assignedQuarters.some((q) => q?.position === 'Goalkeeper')
              const isBelowTarget = totalPlayed < 2

              return (
                <div key={player.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                  <div style={{ width: '90px', fontWeight: 700, color: isBelowTarget ? '#f87171' : '#f3f4f6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isBelowTarget && <span style={{ marginRight: '2px' }}>⚠️</span>}
                    {getPlayerDisplayName(player)} <span style={{ color: '#6b7280', fontSize: '10px' }}>#{player.jersey_number ?? '-'}</span>
                    {playedGK && <span style={{ marginLeft: '4px', background: '#f59e0b', color: '#000', fontSize: '8px', fontWeight: 900, padding: '1px 3px', borderRadius: '3px' }}>GK</span>}
                  </div>

                  {/* Horizontal Bar Visualizer */}
                  <div style={{ flex: 1, height: '12px', background: '#1f2937', borderRadius: '6px', overflow: 'hidden', display: 'flex' }}>
                    <div style={{
                      width: `${(totalPlayed / 4) * 100}%`,
                      height: '100%',
                      background: isBelowTarget ? '#f87171' : totalPlayed === 2 ? '#38bdf8' : '#34d399',
                      borderRadius: '6px',
                      transition: 'width 0.3s ease',
                    }} />
                  </div>

                  <span style={{ width: '24px', textAlign: 'right', fontWeight: 800, color: isBelowTarget ? '#f87171' : '#34d399', fontSize: '11px' }}>
                    {totalPlayed}/4
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Full Match Rotation Overview (4 Quarter Thumbnails) */}
        <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>📊</span>
              <strong style={{ fontSize: '13px', color: '#fff' }}>Full Match Rotation Overview</strong>
            </div>
            <span style={{ fontSize: '10px', color: '#6b7280' }}>4 Quarters At-A-Glance</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
            {[1, 2, 3, 4].map((q) => {
              const qLineup = allGameLineups.filter((item) => item.quarter === q)
              return (
                <div key={q} style={{ background: '#022c22', border: '1px solid #059669', borderRadius: '10px', padding: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', fontWeight: 800, color: '#34d399', marginBottom: '4px' }}>Q{q} ({qLineup.length}/7)</div>
                  <div style={{ height: '70px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '4px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399' }} />
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399' }} />
                    </div>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399' }} />
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399' }} />
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399' }} />
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399' }} />
                    </div>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>
    )
  }
      
  return (
    <>
      <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>Beautiful Game IQ</h1>
          <p>Know the game. Coach the moment.</p>
          <p style={{ marginTop: '4px', opacity: 0.85 }}>Your AI copilot for game day.</p>
          <p style={{ marginTop: '10px', fontSize: '14px', opacity: 0.8 }}>Signed in as: {currentUserEmail}</p>
          <button type="button" className="header-help-button" onClick={() => { setHelpReturnScreen('home'); setScreen('help'); setHelpStep(0) }}>Help</button>
          <div className="header-account-actions">
            <button
              type="button"
              onClick={signOut}
            >
              Sign Out
            </button>
            <button
              type="button"
              onClick={deleteAccount}
              disabled={deletingAccount}
            >
              {deletingAccount ? 'Deleting Account...' : 'Delete Account'}
            </button>
                        <button
              type="button"
              onClick={() => setBugReportOpen(true)}
            >
              Report a Bug
            </button>
            <Monetization userId={currentUserId} />
          </div>
        </div>
      </header>

      {showNewTeamForm && (
        <div className="app-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="new-team-title">
          <section className="team-card app-modal-card">
            <div className="section-header">
              <div>
                <h2 id="new-team-title">Create Your Team</h2>
                <span>Start a clean new team without leaving the current account.</span>
              </div>
            </div>

            <div className="form-grid">
              <label>
                Team Name
                <input value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="Enter team name" autoFocus />
              </label>
              <label>
                City
                <input value={newTeamCity} onChange={(e) => setNewTeamCity(e.target.value)} placeholder="e.g. Redlands" />
              </label>

              <label>
                Coach Name
                <input value={newTeamCoachName} onChange={(e) => setNewTeamCoachName(e.target.value)} placeholder="Head coach name" />
              </label>


              <label>
                Age Group
                <select value={newTeamAgeGroup} onChange={(e) => setNewTeamAgeGroup(e.target.value)}>
                  {['U08','U09','U10','U11','U12','U13','U14','U15','U16','U17','U18'].map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>

              <label>
                Format
                <select value={newTeamFormat} onChange={(e) => setNewTeamFormat(e.target.value)}>
                  <option value="6v6">6v6</option>
                  <option value="7v7">7v7</option>
                  <option value="9v9">9v9</option>
                  <option value="11v11">11v11</option>
                </select>
              </label>

              <label>
                Season
                <select value={newTeamSeasonType} onChange={(e) => setNewTeamSeasonType(e.target.value)}>
                  {['Fall','Winter','Spring','Summer','Year Round'].map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>

              <label>
                Year
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={newTeamSeasonYear}
                  onChange={(e) => setNewTeamSeasonYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="YYYY"
                />
              </label>
            </div>

            <div className="app-modal-actions">
              <button type="button" className="primary-button" onClick={() => void createTeam()}>Create Team</button>
              <button type="button" className="secondary-button" onClick={() => setShowNewTeamForm(false)}>Cancel</button>
            </div>
          </section>
        </div>
      )}

      {bugReportOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: '20px' }}>
          <section style={{ background: 'white', color: '#111', borderRadius: '16px', padding: '22px', width: 'min(560px, 100%)', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <h2 style={{ marginTop: 0 }}>Report a Bug</h2>
            <p style={{ marginTop: 0 }}>Tell us what went wrong. The report is securely tracked and sent to Beautiful Game IQ support with useful diagnostic information.</p>
            <label style={{ display: 'block', marginBottom: '12px' }}>
              <span>Severity</span>
              <select value={bugReport.severity} onChange={(e) => setBugReport({ ...bugReport, severity: e.target.value })} style={{ width: '100%' }}>
                <option>Low</option><option>Normal</option><option>High</option><option>Game Day Critical</option>
              </select>
            </label>
            <label style={{ display: 'block', marginBottom: '12px' }}>
              <span>What is wrong?</span>
              <input value={bugReport.summary} onChange={(e) => setBugReport({ ...bugReport, summary: e.target.value })} placeholder="Example: Save lineup button does nothing" style={{ width: '100%' }} />
            </label>
            <label style={{ display: 'block', marginBottom: '16px' }}>
              <span>What happened?</span>
              <textarea value={bugReport.details} onChange={(e) => setBugReport({ ...bugReport, details: e.target.value })} placeholder="What did you click, what did you expect, and what happened instead?" rows={6} style={{ width: '100%' }} />
            </label>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setBugReportOpen(false)}>Cancel</button>
              <button type="button" className="primary-button" disabled={!bugReport.summary.trim() || !bugReport.details.trim()} onClick={submitBugReport}>Send Bug Report</button>
            </div>
          </section>
        </div>
      )}

      <main className="main-content">
        {archivedViewTeam ? (
          renderArchivedTeamView()
        ) : showNewUserOnboarding ? (
          renderNewUserOnboarding()
        ) : (
          <>
            {screen === 'home' && renderHome()}
            {screen === 'roster' && renderRoster()}
            {screen === 'new-game' && renderNewGame()}
            {screen === 'lineup' && renderLineup()}
            {screen === 'live-game' && renderLiveGame()}
            {screen === 'games' && renderGames()}
            {screen === 'team-rules' && renderTeamRules()}
            {screen === 'coaches' && renderCoaches()}
            {screen === 'help' && renderHelp()}
          </>
        )}
      </main>

    </div>

      {!showNewUserOnboarding && (
        <nav className="bottom-nav">
          <button onClick={async () => { setArchivedViewTeam(null); await loadApp(); setScreen('home') }}>
            <span>Home</span>
          </button>
          <button onClick={() => setScreen('roster')}>
            <span>Roster</span>
          </button>
          <button onClick={() => setScreen('games')}>
            <span>Games</span>
          </button>
          <button onClick={() => setScreen('help')} aria-label="Coach Guide">
            <span>Help</span>
          </button>
        </nav>
      )}
    </>
  )
}

export default App




















