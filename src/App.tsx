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

  const [screen, setScreen] = useState<
    'home' | 'roster' | 'new-game' | 'lineup' | 'attendance' | 'live-game' | 'games' | 'team-rules' | 'coaches'
  >('home')

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
  const [currentUserName, setCurrentUserName] = useState('')
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

  async function loadApp(teamId = selectedTeamId) {
    setLoading(true)

    const { data: membershipData, error: membershipError } = await supabase
      .from('team_members')
      .select('team_id, role, user_id, is_head_coach')

    if (membershipError) {
      console.error(membershipError)
      alert(`Could not load your team access: ${membershipError.message}`)
      setLoading(false)
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
      setLoading(false)
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
    const { data: eventData, error: eventError } = gameIds.length > 0
      ? await supabase
          .from('game_events')
          .select('*')
          .in('game_id', gameIds)
          .order('created_at', { ascending: true })
      : { data: [], error: null }

    if (eventError) {
      console.error(eventError)
    }

    const { data: lineupData, error: lineupError } = gameIds.length > 0
      ? await supabase
          .from('game_lineups')
          .select('player_id, quarter, position, game_id')
          .in('game_id', gameIds)
      : { data: [], error: null }

    if (lineupError) console.error(lineupError)

    const { data: actualLineupData, error: actualLineupError } = gameIds.length > 0
      ? await supabase
          .from('game_live_lineups')
          .select('player_id, quarter, position, game_id')
          .in('game_id', gameIds)
      : { data: [], error: null }

    if (actualLineupError) console.error(actualLineupError)

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
      setMinQuartersPlayed(String(teamData.min_quarters_played ?? 0))
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
    setLoading(false)
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
    if (!name) {
      alert('Enter a team name.')
      return
    }

    const { data, error } = await supabase
      .from('teams')
      .insert({
        name,
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

    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id

    if (!userId) {
      alert('Your session expired. Please sign in again.')
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
    setShowNewTeamForm(false)
    setSelectedTeamId(data.id)
  }

  async function saveTeamRules() {
    const payload = {
      max_gk_quarters: Number(maxGkQuarters),
      max_bench_quarters: Number(maxBenchQuarters),
      min_quarters_played: Number(minQuartersPlayed),
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

    const [eventsResult, liveLineupsResult, lineupsResult, attendanceResult] = await Promise.all([
      supabase.from('game_events').delete().eq('game_id', gameId),
      supabase.from('game_live_lineups').delete().eq('game_id', gameId),
      supabase.from('game_lineups').delete().eq('game_id', gameId),
      supabase.from('game_attendance').delete().eq('game_id', gameId),
    ])

    const firstError =
      eventsResult.error ||
      liveLineupsResult.error ||
      lineupsResult.error ||
      attendanceResult.error

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

  async function createGame() {
    if (!opponent.trim()) {
      alert('Enter an opponent.')
      return
    }

    if (!gameDate) {
      alert('Enter a game date.')
      return
    }

    const { data, error } = await supabase
      .from('games')
      .insert({
        team_id: selectedTeamId,
        opponent: opponent.trim(),
        game_date: gameDate,
        game_time: gameTime || null,
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

    setOpponent('')
    setGameDate('')
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
    setCaptain1Id(game.captain_1_id || '')
    setCaptain2Id(game.captain_2_id || '')

    const { data: attendanceData, error: attendanceError } = await supabase
      .from('game_attendance')
      .select('player_id, status, arrival_quarter, departure_quarter, available_quarters')
      .eq('game_id', game.id)

    if (attendanceError) {
      console.error(attendanceError)
      alert('Could not load attendance.')
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

    const { data, error } = await supabase
      .from('game_lineups')
      .select('*')
      .eq('game_id', game.id)

    if (error) {
      console.error(error)
      alert('Could not load lineup.')
      return
    }

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
    if (!selectedGame || quarter === selectedQuarter) return

    // Save the quarter currently on screen before loading the next one.
    // Coaches should be able to move Q1 -> Q2 without losing unsaved changes.
    if (currentUserRole === 'owner' || currentUserRole === 'coach') {
      const saved = await saveLineup(false)

      if (!saved) {
        alert(`Could not save Q${selectedQuarter}. The quarter was not changed.`)
        return
      }
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

    if (!normalized.includes(selectedQuarter)) {
      setLineup((current) => current.filter((item) => item.player_id !== playerId))
      setAllGameLineups((current) => current.filter((item) => !(item.player_id === playerId && item.quarter === selectedQuarter)))
    }
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
      <div className="app">
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
            <p style={{ marginTop: 0 }}>Tell me what went wrong. The report will include the team, screen, format, browser URL, and your account email.</p>
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
          <p>Loading...</p>
        </main>
      </div>
    )
  }

  function renderCoaches() {
    return (
      <>
        <button className="back-button" onClick={async () => { setArchivedViewTeam(null); await loadApp(); setScreen('home') }}>
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

  function renderTeamRules() {
    return (
      <>
        <button className="back-button" onClick={async () => { setArchivedViewTeam(null); await loadApp(); setScreen('home') }}>
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
              Minimum quarters played
              <input type="number" min="0" max="4" value={minQuartersPlayed} onChange={(e) => setMinQuartersPlayed(e.target.value)} />
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
          {currentUserRole === 'owner' && (
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
            <button className="secondary-button" onClick={toggleTeamArchived}>
              {team?.archived ? 'Unarchive Team' : 'Archive Team'}
            </button>
          </div>
          )}
          </button>
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
    alert(reportId
      ? `Bug report submitted. Reference #${String(reportId).slice(0, 8)}.`
      : 'Bug report submitted. Thank you.')
  }

  function handleAnalyticsSort(field: 'player' | 'played' | 'gk' | 'str' | 'bench' | 'goals' | 'assists' | 'captain') {
    if (analyticsSort === field) {
      setAnalyticsSortAsc((value) => !value)
    } else {
      setAnalyticsSort(field)
      setAnalyticsSortAsc(field === 'player')
    }
  }

  async function searchTeamsToJoin() {
    const search = joinTeamSearch.trim()

    if (search.length < 2) {
      setJoinTeamResults([])
      return
    }

    const { data, error } = await supabase
      .from('teams')
      .select('id, name, age_group, format, season, max_gk_quarters, max_bench_quarters, min_quarters_played, target_quarters_played, require_everyone_play, default_formation, archived')
      .ilike('name', `%${search}%`)
      .eq('archived', false)
      .order('name')
      .limit(20)

    if (error) {
      console.error(error)
      alert(`Could not search teams: `)
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
          ...request,
          full_name: profile?.full_name || 'Unknown User',
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
          await loadJoinRequests()
          return
        }

        console.error(error)
        alert(`Could not request to join ${teamToJoin.name}: ${error.message}`)
        return
      }

      setJoinRequestTeamIds((current) => [...current, teamToJoin.id])
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
              <label>
                Search by Team Name
                <input
                  value={joinTeamSearch}
                  onChange={(e) => setJoinTeamSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      searchTeamsToJoin()
                    }
                  }}
                  placeholder="Enter team name"
                />
              </label>

              <button
                className="primary-button"
                onClick={searchTeamsToJoin}
                disabled={joinTeamSearch.trim().length < 2}
              >
                Search Teams
              </button>
            </div>

            {joinTeamResults.length > 0 && (
              <div style={{ display: 'grid', gap: '12px', marginTop: '20px' }}>
                {joinTeamResults.map((teamToJoin) => {
                  const requestPending = joinRequestTeamIds.includes(teamToJoin.id)

                  return (
                    <div
                      key={teamToJoin.id}
                      className="team-card"
                      style={{ padding: '16px' }}
                    >
                      <strong>{teamToJoin.name}</strong>

                      <div style={{ marginTop: '6px', color: '#666' }}>
                        {teamToJoin.age_group} | {teamToJoin.format} | {teamToJoin.season}
                      </div>

                      <button
                        type="button"
                        className={requestPending ? 'secondary-button' : 'primary-button'}
                        style={{ marginTop: '12px' }}
                        onClick={() => requestToJoinTeam(teamToJoin)}
                      >
                        {requestPending ? 'Request Sent' : 'Request to Join'}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {joinTeamSearch.trim().length >= 2 && joinTeamResults.length === 0 && (
              <p style={{ marginTop: '16px', color: '#666' }}>
                No teams found. Check the team name and try again.
              </p>
            )}
          </div>
        )}
        {showNewTeamForm && (
          <div style={{ marginTop: '24px' }}>
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
  function renderHome() {
    const nextGame = upcomingGames[0]

    return (
      <>
        <section className="welcome">
          <div className="home-team-identity">
            <p className="eyebrow">TEAM</p>
            <h2 className="home-team-name">{team?.name || 'Team'}</h2>
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

          <div className="home-team-bar">
            <label>
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
            </label>            <button className="secondary-button" onClick={() => setShowNewTeamForm((value) => !value)}>
              + New Team
            </button>
            <button
              className="secondary-button"
              onClick={async () => {
                setShowJoinTeam(true)
                setJoinTeamSearch('')
                setJoinTeamResults([])
                await loadJoinRequests()
              }}
            >
              Join Existing Team
            </button>
          </div>

          {showJoinTeam && (
            <div style={{ marginTop: '24px' }}>
              <h3>Join an Existing Team</h3>
              <input
                type="text"
                value={joinTeamSearch}
                onChange={(e) => setJoinTeamSearch(e.target.value)}
                placeholder="Search by team name"
              />
              <button className="secondary-button" onClick={searchTeamsToJoin}>
                Search
              </button>
              {joinTeamResults.map((teamToJoin) => (
                <div key={teamToJoin.id}>
                  <strong>{teamToJoin.name}</strong>
                  <span> {teamToJoin.age_group} | {teamToJoin.format} | {teamToJoin.season}</span>
                  <button
                    className="secondary-button"
                    onClick={() => requestToJoinTeam(teamToJoin)}
                    disabled={joinRequestTeamIds.includes(teamToJoin.id)}
                  >
                    {joinRequestTeamIds.includes(teamToJoin.id) ? 'Request Sent' : 'Request to Join'}
                  </button>
                </div>
              ))}
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
            <button className="primary-button" onClick={() => setScreen('new-game')}>+ Schedule Game</button>
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
          <button onClick={() => setScreen('new-game')}>+ New Game</button>
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
                <th onClick={() => handleAnalyticsSort('captain')}>Captain<br /><span>Gms</span></th>
              </tr></thead>
              <tbody>
                {players.map((player) => {
                  const rows = completedSeasonLineups.filter(
                    (item) => item.player_id === player.id
                  )

                  const roleCounts = { GK: 0, DEF: 0, MID: 0, STR: 0 }

                  rows.forEach((item) => {
                    const role =
                      item.position === 'Goalkeeper'
                        ? 'GK'
                        : item.position.includes('Defense')
                          ? 'DEF'
                          : item.position.includes('Mid')
                            ? 'MID'
                            : 'STR'

                    roleCounts[role]++
                  })

                  const played = rows.length
                  const possibleQuarters = completedGames.length * 4
                  const bench = Math.max(0, possibleQuarters - played)

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
                      <td>{played}</td>
                      <td>{roleCounts.GK}</td>
                      <td>{roleCounts.DEF}</td>
                      <td>{roleCounts.MID}</td>
                      <td>{roleCounts.STR}</td>
                      <td>{bench}</td>
                      <td>{goals}</td>
                      <td>{assists}</td>
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
          onClick={() => setScreen('home')}
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
                  })
                }

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
              <h2>New Game</h2>
              <span>
                Create a game and build the lineup.
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

            <input
              type="date"
              value={gameDate}
              onChange={(e) => setGameDate(e.target.value)}
            />

            <input
              type="time"
              value={gameTime}
              onChange={(e) => setGameTime(e.target.value)}
            />

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
              onClick={createGame}
            >
              Create Game
            </button>
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
        <strong>vs. {game.opponent}</strong>

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
          onClick={() => setScreen('home')}
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
        onBack={async () => { await loadApp(); setScreen('home') }}
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

  async function saveLineup(showSuccess = true) {
    if (!selectedGame) return false

    // Validate lineup data before sending anything to Supabase.
    // player_id MUST be an actual player UUID; position is the position string.
    const validRows = lineup
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
        quarter: selectedQuarter,
        player_id: item.player_id,
        position: item.position,
      }))

    // If the UI somehow created a malformed lineup, stop before deleting
    // the existing saved lineup so we never destroy good data.
    if (validRows.length !== lineup.length) {
      console.error('Invalid lineup data:', lineup)
      alert('Could not save lineup: one or more player assignments are invalid. Please reassign the affected position.')
      return false
    }

    const { error: deleteError } = await supabase
      .from('game_lineups')
      .delete()
      .eq('game_id', selectedGame.id)
      .eq('quarter', selectedQuarter)

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

    setAllGameLineups((current) => [
      ...current.filter((item) => item.quarter !== selectedQuarter),
      ...lineup,
    ])

    if (showSuccess) {
      alert(`Q${selectedQuarter} lineup saved successfully.`)
    }

    return true
  }
  function renderLineup() {
    if (!selectedGame) return null

    const canManageGame = currentUserRole === 'owner' || currentUserRole === 'coach'

    return (
      <>
        <button
          className="back-button"
          onClick={async () => {
            if (canManageGame) {
              const saved = await saveLineup()

              if (!saved) {
                alert('Could not save the current quarter.')
                return
              }
            }

            setScreen('home')
          }}
        >
           Back
        </button>

        <section className="team-card">
          <div className="section-header">
            <div>
              <h2>vs. {selectedGame.opponent}</h2>

              <span>
                {selectedGame.game_date}
                {selectedGame.game_time
                  ? `  ${formatGameTime(selectedGame.game_time)}`
                  : ''}
              </span>
            </div>

            <button
              className="primary-button"
              onClick={() => saveLineup()}
              disabled={savingLineup || !canManageGame}
            >
              {savingLineup ? 'Saving...' : 'Save Lineup'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button
              className="secondary-button"
              onClick={() => {
                if (confirm("Clear current quarter lineup?")) {
                  setLineup([])
                }
              }}
              disabled={savingLineup || !canManageGame}
            >
              Clear Q{selectedQuarter} Lineup
            </button>
          </div><div style={{ marginBottom: '12px', padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 8px' }}>Game Captains</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <select value={captain1Id} onChange={(e) => setCaptain1Id(e.target.value)}>
                <option value="">Captain 1</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    #{player.jersey_number ?? '-'} {player.first_name || player.name.split(' ')[0]}
                  </option>
                ))}
              </select>
              <select value={captain2Id} onChange={(e) => setCaptain2Id(e.target.value)}>
                <option value="">Captain 2</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    #{player.jersey_number ?? '-'} {player.first_name || player.name.split(' ')[0]}
                  </option>
                ))}
              </select>
            </div>
            <button className="secondary-button" onClick={saveCaptains} disabled={!canManageGame} style={{ marginTop: '8px', width: '100%' }}>
              Save Captains
            </button>
          </div>

          <details style={{ marginBottom: '12px', padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }} open={false}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
              Attendance ({players.filter((p) => (gameAttendance[p.id]?.available_quarters || [1, 2, 3, 4]).length > 0).length} available)
            </summary>
            <div style={{ fontSize: '12px', margin: '8px 0', opacity: 0.7 }}>
              Everyone starts available for all four quarters. Tap a quarter to turn a player's availability off. Use None for absent all game or All for fully available.
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {[...players].sort((a, b) => {
                    if (analyticsSort === 'player') {
                      const result = a.name.localeCompare(b.name)
                      return analyticsSortAsc ? result : -result
                    }

                    const getValue = (player: typeof players[number]) => {
                      const playerEvents = completedGameEvents.filter((event) => event.player_id === player.id)
                      const playerAssists = completedGameEvents.filter((event) => event.assister_id === player.id).length
                      const playerGoals = playerEvents.filter((event) => event.event_type === 'our_goal').length
                      const playerLineups = actualSeasonLineups.filter((lineup) => lineup.player_id === player.id)
                      const playerPlayed = playerLineups.length
                      const playerGk = playerLineups.filter((lineup) => lineup.position === 'Goalkeeper').length
                      const playerStr = playerLineups.filter((lineup) => lineup.position === 'Center Striker').length
                      const playerCaptain = completedGames.filter(
                        (game) => game.captain_1_id === player.id || game.captain_2_id === player.id
                      ).length
                      const playerBench = Math.max(0, completedGames.length * 4 - playerPlayed)

                      return {
                        played: playerPlayed,
                        gk: playerGk,
                        str: playerStr,
                        bench: playerBench,
                        goals: playerGoals,
                        assists: playerAssists,
                        captain: playerCaptain,
                      }[analyticsSort]
                    }

                    const aValue = getValue(a) as number
                    const bValue = getValue(b) as number
                    const result = bValue - aValue
                    return analyticsSortAsc ? -result : result
                  }).map((player) => {
                const quarters = gameAttendance[player.id]?.available_quarters || [1, 2, 3, 4]
                return (
                  <div key={player.id} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <strong>#{player.jersey_number ?? '-'} {player.first_name || player.name.split(' ')[0]}</strong>
                      <span style={{ fontSize: '12px', opacity: 0.7 }}>{attendanceSummary(quarters)}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px', marginTop: '7px' }}>
                      {[1, 2, 3, 4].map((q) => {
                        const on = quarters.includes(q)
                        return (
                          <button
                            key={q}
                            type="button"
                            className={on ? 'primary-button' : 'secondary-button'}
                            disabled={!canManageGame}
                            onClick={() => {
                              const next = on ? quarters.filter((item) => item !== q) : [...quarters, q]
                              void saveAttendanceAvailability(player.id, next)
                            }}
                            style={{ padding: '8px 6px', fontSize: '12px', width: '100%' }}
                          >
                            Q{q}
                          </button>
                        )
                      })}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px' }}>
                      <button type="button" className="secondary-button" disabled={!canManageGame} onClick={() => void saveAttendanceAvailability(player.id, [1, 2, 3, 4])} style={{ padding: '8px', fontSize: '12px' }}>All Quarters</button>
                      <button type="button" className="secondary-button" disabled={!canManageGame} onClick={() => void saveAttendanceAvailability(player.id, [])} style={{ padding: '8px', fontSize: '12px' }}>Absent</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </details>

          {(() => {
            const advice = rotationAdvice()
            return (
              <div
                style={{
                  marginBottom: '12px',
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  background: '#f7f7f7',
                }}
              >
                <strong>Coach Assist</strong>
                <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>
                  {advice.message}
                </div>

                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #ddd' }}>
                  <div style={{ marginTop: '10px', padding: '10px', border: '1px solid #ccc', borderRadius: '8px', background: '#fff' }}>
                    <strong>Game Situation</strong>
                    <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>
                      Changes Coach Assist priorities without changing your team rules.
                    </div>
                    <select
                      value={gameSituation}
                      disabled={!canManageGame}
                      onChange={(e) => {
                        setGameSituation(e.target.value as typeof gameSituation)
                        setQuarterSuggestion(null)
                        setWholeGameSuggestion(null)
                      }}
                      style={{ marginTop: '8px', width: '100%' }}
                    >
                      <option>Normal</option>
                      <option>Protect Lead</option>
                      <option>Need Goal</option>
                      <option>Development</option>
                      <option>Pull Back / AYSO Mode</option>
                    </select>
                    <div style={{ marginTop: '10px' }}>
                      <strong>Formation</strong>
                      <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>
                        Choose the shape for the lineup and Coach Assist. Changing the formation updates the position slots below.
                      </div>
                      <select
                        value={optimizationFormation}
                        disabled={!canManageGame}
                        onChange={(e) => {
                          const nextFormation = e.target.value
                          const nextPositions = positionsForFormation(nextFormation)

                          setOptimizationFormation(nextFormation)
                          setWholeGameSuggestion(null)
                          setQuarterSuggestion(null)

                          // Remove current-quarter assignments that no longer exist
                          // in the newly selected formation. This only changes the
                          // unsaved lineup until the coach saves it.
                          setLineup((current) =>
                            current.filter((item) => nextPositions.includes(item.position))
                          )
                        }}
                        style={{ marginTop: '8px', width: '100%' }}
                      >
                        {getFormationsForFormat(selectedGame?.format || '7v7').map((formation) => (
                          <option key={formation} value={formation}>{formation}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <strong>Whole-Game Plan</strong>
                  <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>
                    Build one four-quarter rotation using coach knowledge, team rules, attendance, position fit, GK limits, bench sequence, and the selected formation.
                  </div>
                  <div style={{ fontSize: '12px', marginTop: '8px', opacity: 0.7 }}>
                    Current optimization shape: <strong>{optimizationFormation}</strong>
                  </div>
                  <button
                    className="secondary-button"
                    style={{ marginTop: '8px' }}
                    onClick={optimizeWholeGame}
                    disabled={savingLineup || !canManageGame}
                  >
                    Optimize All 4 Quarters
                  </button>
                  {wholeGameSuggestion && (
                    <div style={{ marginTop: '8px' }}>
                      <button
                        className="primary-button"
                        onClick={applyWholeGamePlan}
                        disabled={savingLineup || !canManageGame}
                      >
                        Apply Full Game Plan
                      </button>
                      <div style={{ marginTop: '8px', display: 'grid', gap: '4px', fontSize: '12px' }}>
                        {[1, 2, 3, 4].map((quarter) => {
                          const q = wholeGameSuggestion.filter((item) => item.quarter === quarter)
                          return (
                            <div key={quarter}>
                              <strong>Q{quarter}:</strong>{' '}
                              {q.map((item) => `#${players.find((p) => p.id === item.player_id)?.jersey_number ?? '-'} ${players.find((p) => p.id === item.player_id)?.name ?? 'Unknown'} (${positionShort(item.position)})`).join(', ') || 'No lineup'}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '10px' }}>
                  <button
                    className="secondary-button"
                    onClick={optimizeCurrentQuarter}
                    disabled={savingLineup || !canManageGame}
                  >
                    Optimize Q{selectedQuarter}
                  </button>
                </div>

                {quarterSuggestion && quarterSuggestion.suggestedLineup.length > 0 && (
                  <div style={{ marginTop: '10px' }}>
                    <strong>Suggested Q{selectedQuarter} lineup:</strong>
                    <div style={{ marginTop: '8px' }}>
                      <button
                        className="primary-button"
                        onClick={applySuggestedLineup}
                        disabled={savingLineup || !canManageGame}
                      >
                        Apply Suggested Q{selectedQuarter} Lineup
                      </button>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '5px 12px',
                        marginTop: '6px',
                        fontSize: '13px',
                      }}
                    >
                      {quarterSuggestion.suggestedLineup.map(({ position, player }) => (
                        <div key={position}>
                          <span style={{ opacity: 0.65 }}>{positionShort(position)}:</span>{' '}
                          #{player.jersey_number ?? '-'} {player.first_name || player.name.split(' ')[0]}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ marginTop: '10px' }}>
                  <strong>Priority for minutes:</strong>{' '}
                  {advice.priority.length > 0
                    ? advice.priority
                        .map(
                          (player) =>
                            `#${player.jersey_number ?? '-'} ${player.first_name || player.name.split(' ')[0]} (${playerQuartersPlayed(player.id)}/4)`
                        )
                        .join(', ')
                    : 'None'}
                </div>

                {advice.gk && (
                  <div style={{ marginTop: '6px' }}>
                    <strong>GK option:</strong>{' '}
                    #{advice.gk.jersey_number ?? '-'} {advice.gk.name}
                  </div>
                )}
              </div>
            )
          })()}

          <div className="quarter-tabs">
            {[1, 2, 3, 4].map((quarter) => {
              const count = allGameLineups.filter(
                (item) => item.quarter === quarter
              ).length

              return (
                <button
                  key={quarter}
                  className={
                    selectedQuarter === quarter
                      ? 'primary-button'
                      : 'secondary-button'
                  }
                  onClick={() => changeQuarter(quarter)}
                  disabled={savingLineup}
                >
                  Q{quarter}
                  <span
                    style={{
                      marginLeft: '4px',
                      fontSize: '11px',
                    }}
                  >
                    ({count})
                  </span>
                </button>
              )
            })}
          </div>

          <h3 className="lineup-heading">
            Q{selectedQuarter} Positions
          </h3>

          <div style={{ borderRadius: 14, padding: 12, background: 'linear-gradient(180deg, #dff2df 0%, #cfe8cf 100%)', border: '2px solid #b8cdb8', display: 'grid', gap: 8 }}>
            {(formationRows[optimizationFormation] || []).map((row, rowIndex) => (
              <div key={rowIndex} style={{ display: 'grid', gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))`, gap: 8 }}>
                {row.map((position) => {
                  const assignment = playerAtPosition(position)
                  const player = assignment ? players.find((p) => p.id === assignment.player_id) : null
                  return (
                    <button
                      key={position}
                      type="button"
                      onClick={() => setSelectedPreplanPlayerId(assignment?.player_id || `__empty__:${position}`)}
                      disabled={!canManageGame}
                      style={{ minHeight: 64, padding: 6, border: '1px solid #aab8aa', borderRadius: 8, background: 'white', cursor: canManageGame ? 'pointer' : 'default' }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.65 }}>{positionShort(position)}</div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{player ? `#${player.jersey_number ?? '-'} ${player.first_name || player.name.split(' ')[0]}` : 'Tap to assign'}</div>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, padding: 12, border: '1px solid #d4dce5', borderRadius: 10, background: '#f7f9fb' }}>
            <strong>Bench / Unused Players</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {players.filter((p) => !lineup.some((item) => item.player_id === p.id)).map((player) => (
                <button key={player.id} type="button" className="secondary-button" onClick={() => setSelectedPreplanPlayerId(player.id)} disabled={!canManageGame}>
                  #{player.jersey_number ?? '-'} {player.first_name || player.name.split(' ')[0]}
                </button>
              ))}
              {players.filter((p) => !lineup.some((item) => item.player_id === p.id)).length === 0 && (
                <span style={{ fontSize: 13, opacity: .7 }}>No unused players</span>
              )}
            </div>
          </div>


          {selectedPreplanPlayerId && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              <div style={{ background: 'white', width: 'min(560px, 100%)', borderRadius: '18px 18px 0 0', padding: 18, maxHeight: '75vh', overflowY: 'auto' }}>
                {(() => {
                  const isEmptyPosition = selectedPreplanPlayerId.startsWith('__empty__:')
                  const selectedAssignment = lineup.find(
                    (item) => item.player_id === selectedPreplanPlayerId
                  )
                  const selectedPlayer = players.find(
                    (player) => player.id === selectedPreplanPlayerId
                  )

                  const assignToPosition = (position: string) => {
                    if (isEmptyPosition) {
                      const playerId = selectedPreplanPlayerId.replace('__empty__:', '')
                      assignPlayer(playerId, position)
                    } else {
                      assignPlayer(selectedPreplanPlayerId, position)
                    }
                    setSelectedPreplanPlayerId(null)
                  }

                  const replaceWithBenchPlayer = (benchPlayerId: string) => {
                    if (!selectedAssignment) return
                    assignPlayer(benchPlayerId, selectedAssignment.position)
                    setSelectedPreplanPlayerId(null)
                  }

                  return (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong>
                          {isEmptyPosition
                            ? `Assign ${positionShort(selectedPreplanPlayerId.replace('__empty__:', ''))}`
                            : `Move ${selectedPlayer?.first_name || selectedPlayer?.name?.split(' ')[0] || 'Player'}`}
                        </strong>
                        <button type="button" onClick={() => setSelectedPreplanPlayerId(null)}>
                          Close
                        </button>
                      </div>

                      {isEmptyPosition ? (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontWeight: 800, marginBottom: 8 }}>
                            Assign player
                          </div>
                          <div style={{ display: 'grid', gap: 8 }}>
                            {players
                              .filter((p) => !lineup.some((item) => item.player_id === p.id))
                              .map((player) => (
                                <button
                                  key={player.id}
                                  type="button"
                                  className="secondary-button"
                                  disabled={!playerAvailableForQuarter(player.id, selectedQuarter)}
                                  onClick={() => {
                                    const position = selectedPreplanPlayerId.replace('__empty__:', '')
                                    assignPlayer(player.id, position)
                                    setSelectedPreplanPlayerId(null)
                                  }}
                                >
                                  #{player.jersey_number ?? '-'} {player.first_name || player.name.split(' ')[0]}
                                </button>
                              ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{ marginTop: 12 }}>
                          {selectedAssignment && (
                            <>
                              <div style={{ fontWeight: 800, marginBottom: 8 }}>
                                Replace {selectedPlayer?.first_name || selectedPlayer?.name?.split(' ')[0] || 'player'} with bench player
                              </div>

                              <div style={{ display: 'grid', gap: 8 }}>
                                {players
                                  .filter((p) => !lineup.some((item) => item.player_id === p.id))
                                  .map((benchPlayer) => (
                                    <button
                                      key={benchPlayer.id}
                                      type="button"
                                      className="secondary-button"
                                      disabled={!playerAvailableForQuarter(benchPlayer.id, selectedQuarter)}
                                      onClick={() => replaceWithBenchPlayer(benchPlayer.id)}
                                    >
                                      Replace {selectedPlayer?.first_name || selectedPlayer?.name?.split(' ')[0] || 'player'} with {benchPlayer.first_name || benchPlayer.name.split(' ')[0]}
                                    </button>
                                  ))}
                              </div>
                            </>
                          )}

                          <div style={{ fontWeight: 800, margin: '16px 0 8px' }}>
                            {selectedAssignment ? 'Move to another position' : 'Assign to position'}
                          </div>

                          <div style={{ display: 'grid', gap: 8 }}>
                            {positionsForFormation(optimizationFormation).map((position) => {
                              
                              const isCurrentPosition =
                                selectedAssignment?.position === position

                              return (
                                <button
                                  key={position}
                                  type="button"
                                  className="secondary-button"
                                  disabled={isCurrentPosition}
                                  onClick={() => {
                                    if (isCurrentPosition) return

                                    if (selectedAssignment) {
                                      const selectedId = selectedPreplanPlayerId

                                      if (!selectedId || selectedId.startsWith("__empty__:")) {
                                        return
                                      }

                                      const selectedPlayer = players.find(
                                        (player) => player.id === selectedId
                                      )

                                      if (!selectedPlayer) {
                                        alert("Please select a valid player.")
                                        return
                                      }

                                      assignPlayer(selectedId, position)

                                      setSelectedPreplanPlayerId(null)
                                    } else {
                                      assignToPosition(position)
                                    }
                                  }}
                                >
                                  {position}
                                </button>
                              )
                            })}
                          </div>

                          {selectedAssignment && (
                            <button
                              type="button"
                              className="secondary-button"
                              style={{ marginTop: 10 }}
                              onClick={() => {
                                removePlayerFromPosition(selectedAssignment.position)
                                setSelectedPreplanPlayerId(null)
                              }}
                            >
                              Remove from lineup
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          )}
        </section>

        {renderPlayingTimeTracker()}

      </>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>Beautiful Game IQ</h1>
          <p>Know the game. Coach the moment.</p>
          <p style={{ marginTop: '4px', opacity: 0.85 }}>Your AI copilot for game day.</p>
          <p style={{ marginTop: '10px', fontSize: '14px', opacity: 0.8 }}>Signed in as: {currentUserEmail}</p>
          <button
            type="button"
            onClick={signOut}
            style={{ marginTop: '10px' }}
          >
            Sign Out
          </button>
          <button
            type="button"
            onClick={() => setBugReportOpen(true)}
            style={{ marginTop: '10px' }}
          >
            Report a Bug
          </button>
        </div>
      </header>

      {bugReportOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: '20px' }}>
          <section style={{ background: 'white', color: '#111', borderRadius: '16px', padding: '22px', width: 'min(560px, 100%)', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <h2 style={{ marginTop: 0 }}>Report a Bug</h2>
            <p style={{ marginTop: 0 }}>Tell me what went wrong. The report will include the team, screen, format, browser URL, and your account email.</p>
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
          </>
        )}
      </main>

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
        </nav>
      )}



    </div>
  )
}

export default App
























