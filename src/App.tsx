import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { supabase } from './supabase'
import LiveGame from './LiveGame'
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
  event_type: 'our_goal' | 'their_goal'
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

const TEAM_ID = '92713845-68a3-4bdc-9455-9d93c24744bf'

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
  const [screen, setScreen] = useState<'home' | 'roster' | 'new-game' | 'lineup' | 'attendance' | 'live-game' | 'games' | 'team-rules' | 'coaches'>('home')
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const [selectedQuarter, setSelectedQuarter] = useState(1)
  const [lineup, setLineup] = useState<LineupItem[]>([])
  const [allGameLineups, setAllGameLineups] = useState<LineupItem[]>([])
  const [gameAttendance, setGameAttendance] = useState<Record<string, AttendanceRecord>>({})
  const [captain1Id, setCaptain1Id] = useState('')
  const [captain2Id, setCaptain2Id] = useState('')
  const [selectedPreplanPlayerId, setSelectedPreplanPlayerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingLineup, setSavingLineup] = useState(false)
  const [wholeGameSuggestion, setWholeGameSuggestion] = useState<LineupItem[] | null>(null)
  const [gameSituation, setGameSituation] = useState<'Normal' | 'Protect Lead' | 'Need Goal' | 'Development' | 'Pull Back / AYSO Mode'>('Normal')
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
  const [maxGkQuarters, setMaxGkQuarters] = useState('2')
  const [maxBenchQuarters, setMaxBenchQuarters] = useState('2')
  const [minQuartersPlayed, setMinQuartersPlayed] = useState('0')
  const [targetQuartersPlayed, setTargetQuartersPlayed] = useState('3')
  const [requireEveryonePlay, setRequireEveryonePlay] = useState(true)
  const [opponent, setOpponent] = useState('')
  const [gameDate, setGameDate] = useState('')
  const [gameTime, setGameTime] = useState('')
  const [location, setLocation] = useState('')
  const [homeAway, setHomeAway] = useState('Home')
  const [gameNotes, setGameNotes] = useState('')
  const [showNewTeamForm, setShowNewTeamForm] = useState(false)
  const [showNewUserOnboarding, setShowNewUserOnboarding] = useState(false)
  const [showJoinTeam, setShowJoinTeam] = useState(false)
  const [showArchivedTeams, setShowArchivedTeams] = useState(false)
  const [joinTeamSearch, setJoinTeamSearch] = useState('')
  const [joinTeamResults, setJoinTeamResults] = useState<Team[]>([])
  const [joinRequestTeamIds, setJoinRequestTeamIds] = useState<string[]>([])
  const [joinRequests, setJoinRequests] = useState<Array<{ id: string; team_id: string; user_id: string; status: 'pending' | 'approved' | 'denied'; created_at: string; full_name: string; email: string }>>([])
  const [analyticsSort, setAnalyticsSort] = useState<'player' | 'played' | 'gk' | 'str' | 'bench' | 'goals' | 'assists' | 'captain'>('player')
  const [analyticsSortAsc, setAnalyticsSortAsc] = useState(true)
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamAgeGroup, setNewTeamAgeGroup] = useState('U10')
  const [newTeamFormat, setNewTeamFormat] = useState('7v7')
  const [newTeamSeasonType, setNewTeamSeasonType] = useState('Fall')
  const [newTeamSeasonYear, setNewTeamSeasonYear] = useState('2026')
  const [staff, setStaff] = useState<Array<{ user_id: string; role: 'owner' | 'coach' | 'viewer'; is_head_coach: boolean; full_name: string; email: string }>>([])
  const [currentUserEmail, setCurrentUserEmail] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
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

  async function updateStaffRole(member: { user_id: string; role: 'owner' | 'coach' | 'viewer'; full_name: string; email: string }, role: 'coach' | 'viewer') {
    if (currentUserRole !== 'owner' || member.user_id === (await supabase.auth.getUser()).data.user?.id) return
    const { error } = await supabase.from('team_members').update({ role }).eq('team_id', selectedTeamId).eq('user_id', member.user_id)
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
      const { error: clearError } = await supabase.from('team_members').update({ is_head_coach: false }).eq('team_id', selectedTeamId)
      if (clearError) {
        console.error(clearError)
        alert(`Could not update Head Coach: ${clearError.message}`)
        return
      }
    }
    const { error: setError } = await supabase.from('team_members').update({ is_head_coach: makeHeadCoach }).eq('team_id', selectedTeamId).eq('user_id', member.user_id)
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
    const { error } = await supabase.from('team_members').delete().eq('team_id', selectedTeamId).eq('user_id', member.user_id)
    if (error) {
      console.error(error)
      alert(`Could not remove ${member.full_name}: ${error.message}`)
      return
    }
    setStaff((current) => current.filter((item) => item.user_id !== member.user_id))
  }

  async function loadApp(teamId = selectedTeamId) {
    setLoading(true)
    const { data: membershipData, error: membershipError } = await supabase.from('team_members').select('team_id, role, user_id, is_head_coach')
    if (membershipError) {
      console.error(membershipError)
      alert(`Could not load your team access: ${membershipError.message}`)
      setLoading(false)
      return
    }
    const memberships = membershipData || []
    const accessibleTeamIds = memberships.map((membership) => membership.team_id)
    const { data: accessibleTeamsForSelection, error: accessibleTeamsSelectionError } = accessibleTeamIds.length > 0
      ? await supabase.from('teams').select('*').in('id', accessibleTeamIds).eq('archived', false).order('name', { ascending: true })
      : { data: [], error: null }
    if (accessibleTeamsSelectionError) {
      console.error(accessibleTeamsSelectionError)
      alert(`Could not load your teams: ${accessibleTeamsSelectionError.message}`)
      setLoading(false)
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
      setCurrentUserId(user?.id || '')
      setCurrentUserRole(memberships.find((membership) => membership.role === 'owner')?.role || memberships[0]?.role || null)
      setTeams([])
      setTeam(null)
      setPlayers([])
      setGames([])
      setGameEvents([])
      setSeasonLineups([])
      setShowNewUserOnboarding(true)
      setLoading(false)
      return
    }
    setShowNewUserOnboarding(false)
    const activeTeamId = activeTeamIds.includes(teamId) ? teamId : activeTeamIds[0]
    if (activeTeamId !== selectedTeamId) {
      setSelectedTeamId(activeTeamId)
      return
    }
    const [{ data: teamData }, { data: playerData }, { data: gameData }, { data: accessibleTeams }] = await Promise.all([
      supabase.from('teams').select('*').eq('id', activeTeamId).single(),
      supabase.from('players').select('*').eq('team_id', activeTeamId).order('jersey_number', { ascending: true, nullsFirst: false }),
      supabase.from('games').select('*').eq('team_id', activeTeamId).order('game_date', { ascending: true }),
      supabase.from('teams').select('*').in('id', accessibleTeamIds).eq('archived', false).order('name', { ascending: true }),
    ])
    const loadedGames = gameData || []
    const gameIds = loadedGames.map((game) => game.id)
    const { data: eventData, error: eventError } = gameIds.length > 0
      ? await supabase.from('game_events').select('*').in('game_id', gameIds).order('created_at', { ascending: true })
      : { data: [], error: null }
    if (eventError) console.error(eventError)
    const { data: lineupData, error: lineupError } = gameIds.length > 0
      ? await supabase.from('game_lineups').select('player_id, quarter, position, game_id').in('game_id', gameIds)
      : { data: [], error: null }
    if (lineupError) console.error(lineupError)
    const { data: actualLineupData, error: actualLineupError } = gameIds.length > 0
      ? await supabase.from('game_live_lineups').select('player_id, quarter, position, game_id').in('game_id', gameIds)
      : { data: [], error: null }
    if (actualLineupError) console.error(actualLineupError)
    const { data: { user } } = await supabase.auth.getUser()
    const currentUserNameFromAuth = user?.user_metadata?.display_name || user?.user_metadata?.full_name || ''
    setCurrentUserEmail(user?.email || '')
    if (user?.id) {
      const { error: profileUpsertError } = await supabase.from('profiles').upsert({
        id: user.id,
        full_name: currentUserNameFromAuth || null,
        email: user.email || null,
      }, { onConflict: 'id' })
      if (profileUpsertError) console.error('Could not sync current coach profile:', profileUpsertError)
    }
    const teamMemberships = memberships.filter((membership) => membership.team_id === activeTeamId)
    const staffUserIds = teamMemberships.map((membership) => membership.user_id)
    const { data: profileData, error: profileError } = staffUserIds.length > 0
      ? await supabase.from('profiles').select('id, full_name, email').in('id', staffUserIds)
      : { data: [], error: null }
    if (profileError) console.error('Could not load staff profiles:', profileError)
    const profileMap = new Map((profileData || []).map((profile) => [profile.id, profile]))
    setTeams((accessibleTeams || []) as Team[])
    setStaff(teamMemberships.map((membership) => {
      const profile = profileMap.get(membership.user_id)
      const isCurrentUser = membership.user_id === user?.id
      return {
        user_id: membership.user_id,
        role: membership.role as 'owner' | 'coach' | 'viewer',
        is_head_coach: membership.is_head_coach === true,
        full_name: profile?.full_name || (isCurrentUser ? currentUserNameFromAuth : '') || 'Team Member',
        email: profile?.email || (isCurrentUser ? user?.email || '' : ''),
      }
    }))
    setCurrentUserEmail(user?.email || '')
    setCurrentUserId(user?.id || '')
    setCurrentUserRole((teamMemberships.find((membership) => membership.user_id === user?.id)?.role as 'owner' | 'coach' | 'viewer' | undefined) || null)
    setTeam(teamData)
    if (teamData) {
      setMaxGkQuarters(String(teamData.max_gk_quarters ?? 2))
      setMaxBenchQuarters(String(teamData.max_bench_quarters ?? 2))
      setMinQuartersPlayed(String(teamData.min_quarters_played ?? 0))
      setTargetQuartersPlayed(String(teamData.target_quarters_played ?? 3))
      setRequireEveryonePlay(teamData.require_everyone_play ?? true)
      const teamFormation = teamData.default_formation || getDefaultFormationForFormat(teamData.format)
      setDefaultFormation(teamFormation)
      setOptimizationFormation(teamFormation)
    }
    setPlayers((playerData || []) as Player[])
    setGames(loadedGames as Game[])
    setGameEvents((eventData || []) as GameEvent[])
    setSeasonLineups((lineupData || []) as (LineupItem & { game_id: string })[])
    setActualSeasonLineups((actualLineupData || []) as (LineupItem & { game_id: string })[])
    setLoading(false)
  }

  async function assignPlayer(playerId: string, position: string) {
    const filtered = lineup.filter((item) => item.position !== position && item.player_id !== playerId)
    setLineup([...filtered, { player_id: playerId, quarter: selectedQuarter, position }])
  }

  async function removePlayerFromPosition(position: string) {
    setLineup(lineup.filter((item) => item.position !== position))
  }

  function playerAtPosition(position: string) {
    return lineup.find((item) => item.position === position)
  }

  function playerAvailableForQuarter(playerId: string, quarter: number) {
    const attendance = gameAttendance[playerId]
    return !attendance || attendance.available_quarters.includes(quarter)
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
        app_version: '1.0.0',
        platform: 'web',
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

  function handleAnalyticsSort(field: 'player' | 'played' | 'gk' | 'str' | 'bench' | 'goals' | 'assists' | 'captain') {
    if (analyticsSort === field) setAnalyticsSortAsc((current) => !current)
    else {
      setAnalyticsSort(field)
      setAnalyticsSortAsc(field === 'player')
    }
  }

  // ... remaining file content intentionally preserved from existing master file ...
