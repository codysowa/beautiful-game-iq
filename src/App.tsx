import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { supabase } from './supabase'
import LiveGame from './LiveGame'
import {
  getRotationAdvice as getSharedRotationAdvice,
  optimizationFormations,
  getDefaultFormationForFormat,
  getFormationsForFormat,
  optimizeWholeGame as getSharedWholeGamePlan,
} from './optimizer'

type Team = {
  id: string
  name: string
  age_group: string
  format: string
  season: string
  max_gk_quarters: number | null
  max_bench_quarters: number | null
  min_quarters_played: number | null
  target_quarters_played: number | null
  require_everyone_play: boolean | null
}

type Player = {
  id: string
  team_id: string
  name: string
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
  const [selectedTeamId, setSelectedTeamId] = useState(TEAM_ID)
  const [players, setPlayers] = useState<Player[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [gameEvents, setGameEvents] = useState<GameEvent[]>([])
  const [seasonLineups, setSeasonLineups] = useState<LineupItem[]>([])

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

  const [loading, setLoading] = useState(true)
  const [savingLineup, setSavingLineup] = useState(false)
  const [wholeGameSuggestion, setWholeGameSuggestion] = useState<LineupItem[] | null>(null)
  const [gameSituation, setGameSituation] = useState<'Normal' | 'Protect Lead' | 'Need Goal' | 'Development' | 'Pull Back / AYSO Mode'>('Normal')
  const [optimizationFormation, setOptimizationFormation] = useState('3-1-2')
  const [quarterSuggestion, setQuarterSuggestion] = useState<ReturnType<typeof getSharedRotationAdvice> | null>(null)

  useEffect(() => {
    if (!selectedGame) return
    const formations = getFormationsForFormat(selectedGame.format)
    const defaultFormation = getDefaultFormationForFormat(selectedGame.format)
    setOptimizationFormation((current) => formations.includes(current) ? current : defaultFormation)
    setWholeGameSuggestion(null)
    setQuarterSuggestion(null)
  }, [selectedGame?.format])

  const [newPlayerName, setNewPlayerName] = useState('')
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
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamAgeGroup, setNewTeamAgeGroup] = useState('U10')
  const [newTeamFormat, setNewTeamFormat] = useState('7v7')
  const [newTeamSeason, setNewTeamSeason] = useState('Fall 2026')
  const [staff, setStaff] = useState<Array<{ user_id: string; role: 'owner' | 'coach' | 'viewer'; full_name: string; email: string }>>([])
  const [currentUserName, setCurrentUserName] = useState('')
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

    await loadApp(selectedTeamId)
  }

  async function loadApp(teamId = selectedTeamId) {
    setLoading(true)

    const { data: membershipData, error: membershipError } = await supabase
      .from('team_members')
      .select('team_id, role, user_id')

    if (membershipError) {
      console.error(membershipError)
      alert(`Could not load your team access: ${membershipError.message}`)
      setLoading(false)
      return
    }

    const memberships = membershipData || []
    const accessibleTeamIds = memberships.map((membership) => membership.team_id)


    if (accessibleTeamIds.length === 0) {
      setTeams([])
      setTeam(null)
      setPlayers([])
      setGames([])
      setGameEvents([])
      setSeasonLineups([])
      setLoading(false)
      return
    }

    const activeTeamId = accessibleTeamIds.includes(teamId)
      ? teamId
      : accessibleTeamIds[0]

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
        supabase.from('teams').select('*').in('id', accessibleTeamIds).order('name', { ascending: true }),
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

    const { data: { user } } = await supabase.auth.getUser()
    const currentUserNameFromAuth =
      user?.user_metadata?.display_name ||
      user?.user_metadata?.full_name ||
      ''

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
          full_name:
            profile?.full_name ||
            (isCurrentUser ? currentUserNameFromAuth : '') ||
            'Team Member',
          email: profile?.email || (isCurrentUser ? user?.email || '' : ''),
        }
      })
    )
    setCurrentUserName(currentUserNameFromAuth)
    setCurrentUserId(user?.id || '')
    setCurrentUserRole((teamMemberships.find((membership) => membership.user_id === user?.id)?.role as 'owner' | 'coach' | 'viewer' | undefined) || null)
    setTeam(teamData)
    if (teamData) {
      setMaxGkQuarters(String(teamData.max_gk_quarters ?? 2))
      setMaxBenchQuarters(String(teamData.max_bench_quarters ?? 2))
      setMinQuartersPlayed(String(teamData.min_quarters_played ?? 0))
      setTargetQuartersPlayed(String(teamData.target_quarters_played ?? 3))
      setRequireEveryonePlay(teamData.require_everyone_play ?? true)
    }
    setPlayers(playerData || [])
    setGames(loadedGames)
    setGameEvents((eventData || []) as GameEvent[])
    setSeasonLineups((lineupData || []) as LineupItem[])
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
        season: newTeamSeason.trim() || 'Fall 2026',
        max_gk_quarters: 2,
        max_bench_quarters: 2,
        min_quarters_played: 0,
        target_quarters_played: 3,
        require_everyone_play: true,
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

  async function addOrUpdatePlayer() {
    const name = newPlayerName.trim()

    if (!name) {
      alert('Enter a player name.')
      return
    }

    const jerseyNumber = newPlayerNumber ? Number(newPlayerNumber) : null

    if (editingPlayerId) {
      const { error } = await supabase
        .from('players')
        .update({
          name,
          jersey_number: jerseyNumber,
        })
        .eq('id', editingPlayerId)

      if (error) {
        console.error(error)
        alert('Could not update player.')
        return
      }
    } else {
      const { error } = await supabase.from('players').insert({
        team_id: selectedTeamId,
        name,
        jersey_number: jerseyNumber,
      })

      if (error) {
        console.error(error)
        alert('Could not add player.')
        return
      }
    }

    setNewPlayerName('')
    setNewPlayerNumber('')
    setEditingPlayerId(null)

    await loadApp()
  }

  function editPlayer(player: Player) {
    setEditingPlayerId(player.id)
    setNewPlayerName(player.name)
    setNewPlayerNumber(
      player.jersey_number === null ? '' : String(player.jersey_number)
    )
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
      .select('player_id, status, arrival_quarter')
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
      }
    }

    for (const player of players) {
      if (!attendanceMap[player.id]) {
        attendanceMap[player.id] = {
          status: 'Present',
          arrival_quarter: null,
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

    setLineup(
      loaded
        .filter((item) => item.quarter === 1)
        .map((item) => ({
          player_id: item.player_id,
          quarter: item.quarter,
          position: item.position,
        }))
    )

    setScreen('lineup')
  }

  async function saveAttendanceStatus(playerId: string, status: 'Present' | 'Absent' | 'Late', arrivalQuarter: number | null = null) {
    if (!selectedGame) return

    const { error } = await supabase.from('game_attendance').upsert({
      game_id: selectedGame.id,
      player_id: playerId,
      status,
      arrival_quarter: status === 'Late' ? (arrivalQuarter || 2) : null,
    }, { onConflict: 'game_id,player_id' })

    if (error) {
      console.error(error)
      alert('Could not save attendance.')
      return
    }

    const nextAttendance: AttendanceRecord = {
      status,
      arrival_quarter: status === 'Late' ? (arrivalQuarter || 2) : null,
    }

    setGameAttendance((current) => ({
      ...current,
      [playerId]: nextAttendance,
    }))

    const unavailableNow =
      status === 'Absent' ||
      (status === 'Late' && selectedQuarter < (arrivalQuarter || 2))

    if (unavailableNow) {
      setLineup((current) => current.filter((item) => item.player_id !== playerId))
      setAllGameLineups((current) => current.filter((item) => {
        if (item.player_id !== playerId) return true
        if (status === 'Absent') return false
        return item.quarter >= (arrivalQuarter || 2)
      }))
    }
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

  async function copyPreviousGameLineup() {
    if (!selectedGame) return

    const { data: previousGames, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('team_id', selectedGame.team_id)
      .lt('game_date', selectedGame.game_date)
      .order('game_date', { ascending: false })
      .limit(1)

    if (gameError) {
      console.error(gameError)
      alert('Could not find the previous game.')
      return
    }

    const previousGame = previousGames?.[0]

    if (!previousGame) {
      alert('No previous game found.')
      return
    }

    const { data: previousLineups, error: lineupError } = await supabase
      .from('game_lineups')
      .select('*')
      .eq('game_id', previousGame.id)
      .order('quarter', { ascending: true })

    if (lineupError) {
      console.error(lineupError)
      alert('Could not load the previous lineup.')
      return
    }

    if (!previousLineups || previousLineups.length === 0) {
      alert('The previous game has no saved lineups.')
      return
    }

    const usableLineups = previousLineups.filter((item) =>
      playerAvailableForQuarter(item.player_id, item.quarter)
    )

    const skippedCount = previousLineups.length - usableLineups.length

    if (
      !confirm(
        'Copy the lineups from vs. ' +
          previousGame.opponent +
          '?' +
          (skippedCount > 0
            ? ' ' +
              skippedCount +
              ' assignment(s) will be skipped because of attendance.'
            : '')
      )
    ) {
      return
    }

    const { error: deleteError } = await supabase
      .from('game_lineups')
      .delete()
      .eq('game_id', selectedGame.id)

    if (deleteError) {
      console.error(deleteError)
      alert('Could not clear the current game lineups.')
      return
    }

    const rows = usableLineups.map((item) => ({
      game_id: selectedGame.id,
      quarter: item.quarter,
      player_id: item.player_id,
      position: item.position,
    }))

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from('game_lineups')
        .insert(rows)

      if (insertError) {
        console.error(insertError)
        alert('Could not copy the previous lineup.')
        return
      }
    }

    setAllGameLineups(
      usableLineups.map((item) => ({
        player_id: item.player_id,
        quarter: item.quarter,
        position: item.position,
      }))
    )

    setLineup(
      usableLineups
        .filter((item) => item.quarter === selectedQuarter)
        .map((item) => ({
          player_id: item.player_id,
          quarter: item.quarter,
          position: item.position,
        }))
    )

    alert('Previous game lineup copied.')
  }
  async function saveLineup(showAlert = true) {
    if (!selectedGame) return false

    setSavingLineup(true)

    const { error: deleteError } = await supabase
      .from('game_lineups')
      .delete()
      .eq('game_id', selectedGame.id)
      .eq('quarter', selectedQuarter)

    if (deleteError) {
      console.error(deleteError)
      setSavingLineup(false)

      if (showAlert) {
        alert('Could not save lineup.')
      }

      return false
    }

    if (lineup.length > 0) {
      const rows = lineup.map((item) => ({
        game_id: selectedGame.id,
        quarter: selectedQuarter,
        player_id: item.player_id,
        position: item.position,
      }))

      const { error: insertError } = await supabase
        .from('game_lineups')
        .insert(rows)

      if (insertError) {
        console.error(insertError)
        setSavingLineup(false)

        if (showAlert) {
          alert('Could not save lineup.')
        }

        return false
      }
    }

    setAllGameLineups((current) => [
      ...current.filter((item) => item.quarter !== selectedQuarter),
      ...lineup,
    ])

    setSavingLineup(false)

    if (showAlert) {
      alert(`Quarter ${selectedQuarter} lineup saved.`)
    }

    return true
  }

  async function changeQuarter(quarter: number) {
    if (!selectedGame || quarter === selectedQuarter) return

    const saved = await saveLineup(false)

    if (!saved) {
      alert('Could not save the current quarter.')
      return
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
    setQuarterSuggestion(null)
    setLineup(nextLineup)

    setAllGameLineups((current) => [
      ...current.filter((item) => item.quarter !== quarter),
      ...nextLineup,
    ])
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

    if (!attendance || attendance.status === 'Present') {
      return true
    }

    if (attendance.status === 'Absent') {
      return false
    }

    if (attendance.status === 'Late') {
      return quarter >= (attendance.arrival_quarter || 2)
    }

    return true
  }

  function assignPlayer(playerId: string, position: string) {
    if (!playerAvailableForQuarter(playerId, selectedQuarter)) {
      const attendance = gameAttendance[playerId]

      if (attendance?.status === 'Absent') {
        alert(`${playerName(playerId)} is marked absent for this game.`)
      } else {
        alert(
          `${playerName(playerId)} is marked late and is not available until Q${attendance?.arrival_quarter || 2}.`
        )
      }

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

  const topScorers = useMemo(() => {
    const totals = new Map<string, number>()
    gameEvents
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
  }, [gameEvents, players])

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
        <button className="back-button" onClick={() => setScreen('home')}>
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
            {staff.map((member) => {
              const isCurrentUser = member.user_id === currentUserId
              return (
                <div key={member.user_id} style={{ border: '1px solid #ddd', borderRadius: '10px', padding: '14px', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block' }}>{member.full_name}</strong>
                    {member.email && <span style={{ fontSize: '12px', opacity: 0.7 }}>{member.email}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {member.role === 'owner' ? (
                      <span style={{ fontSize: '12px', fontWeight: 700 }}>HEAD COACH</span>
                    ) : currentUserRole === 'owner' && !isCurrentUser ? (
                      <>
                        <select
                          value={member.role}
                          onChange={(e) => updateStaffRole(member, e.target.value as 'coach' | 'viewer')}
                          aria-label={`Role for ${member.full_name}`}
                        >
                          <option value="coach">Assistant Coach</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <button className="secondary-button" onClick={() => removeStaffMember(member)}>Remove</button>
                      </>
                    ) : (
                      <span style={{ fontSize: '12px', fontWeight: 700 }}>{member.role === 'coach' ? 'ASSISTANT COACH' : 'VIEWER'}</span>
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
              Email invitations are the next step. The secure invitation service will create the account and add the coach to this team without exposing an admin key in the browser.
            </p>
            <button
              className="primary-button"
              onClick={async () => {
                const email = window.prompt('Assistant coach email:')
                if (!email) return

                const roleInput = window.prompt(
                  'Role: type "coach" for Assistant Coach or "viewer" for Viewer',
                  'coach',
                )
                if (roleInput === null) return

                const role = roleInput.trim().toLowerCase() === 'viewer' ? 'viewer' : 'coach'

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

                alert(`Invitation sent to ${email.trim()}`)
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
        <button className="back-button" onClick={() => setScreen('home')}>
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

          <button className="primary-button" onClick={saveTeamRules} style={{ marginTop: '16px' }}>
            Save Team Rules
          </button>
        </section>
      </>
    )
  }

  function submitBugReport() {
    const owner = staff.find((member) => member.role === 'owner')
    const reporter = staff.find((member) => member.user_id === currentUserId)
    const recipient = owner?.email || ''
    const subject = `[Beautiful Game IQ Bug] ${bugReport.summary || 'Bug report'}`
    const body = [
      `Beautiful Game IQ bug report`,
      `Team: ${team?.name || 'Unknown'}`,
      `Format: ${team?.format || 'Unknown'}`,
      `Reported by: ${reporter?.email || currentUserName || 'Unknown'}`,
      `Severity: ${bugReport.severity}`,
      `Screen: ${screen}`,
      `URL: ${window.location.href}`,
      '',
      `Summary: ${bugReport.summary}`,
      '',
      `What happened:`,
      bugReport.details,
    ].join('\n')

    if (!recipient) {
      navigator.clipboard?.writeText(body)
      alert('Bug report copied to your clipboard. The team owner email is not available yet.')
      return
    }

    window.location.href = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    setBugReportOpen(false)
    setBugReport({ severity: 'Normal', summary: '', details: '' })
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
                {staff.filter((member) => member.role === 'owner' || member.role === 'coach').map((member) => (
                  <span key={member.user_id} className="home-coach">
                    <strong>{member.full_name}</strong>
                    <span>{member.role === 'owner' ? 'Head Coach' : 'Assistant Coach'}</span>
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
                    {availableTeam.name} — {availableTeam.age_group} {availableTeam.format}
                  </option>
                ))}
              </select>
            </label>
            {currentUserRole === 'owner' && (
              <button className="secondary-button" onClick={() => setShowNewTeamForm((value) => !value)}>
                + New Team
              </button>
            )}
          </div>

          {showNewTeamForm && (
            <section className="team-card create-team-card">
              <div className="section-header">
                <div>
                  <h3>Create Team</h3>
                  <span>Add another team without affecting the current team's roster or games.</span>
                </div>
              </div>
              <div className="create-team-grid">
                <label><span>Team Name</span><input value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="Blue Tigers" /></label>
                <label><span>Age Group</span><select value={newTeamAgeGroup} onChange={(e) => setNewTeamAgeGroup(e.target.value)}>{['U08','U09','U10','U11','U12','U13','U14','U15','U16','U17','U18'].map((value) => <option key={value}>{value}</option>)}</select></label>
                <label><span>Format</span><select value={newTeamFormat} onChange={(e) => setNewTeamFormat(e.target.value)}>{['6v6','7v7','9v9','11v11'].map((value) => <option key={value}>{value}</option>)}</select></label>
                <label><span>Season</span><input value={newTeamSeason} onChange={(e) => setNewTeamSeason(e.target.value)} /></label>
              </div>
              <div className="form-buttons">
                <button className="primary-button" onClick={createTeam}>Create Team</button>
                <button className="secondary-button" onClick={() => setShowNewTeamForm(false)}>Cancel</button>
              </div>
            </section>
          )}
        </section>

        <section className="home-next-game">
          <div className="section-header">
            <div>
              <p className="eyebrow">UP NEXT</p>
              <h2>{nextGame ? `vs. ${nextGame.opponent}` : 'No upcoming game'}</h2>
            </div>
            {nextGame && <span>{nextGame.game_date}{nextGame.game_time ? ` · ${formatGameTime(nextGame.game_time)}` : ''}</span>}
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
          <button type="button" onPointerDown={(e) => { e.preventDefault(); setScreen('coaches'); window.scrollTo(0, 0) }}>Coaches & Staff</button>
        </div>

        <section className="team-card home-team-summary">
          <div>
            <p className="eyebrow">CURRENT TEAM</p>
            <h2>{team?.name}</h2>
            <p>{team?.age_group} · {team?.format} · {team?.season}</p>
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
                <th className="player-col">Player</th>
                <th>QTRS<br /><span>Played</span></th>
                <th>GK<br /><span>Qtrs</span></th>
                <th>DEF<br /><span>Qtrs</span></th>
                <th>MID<br /><span>Qtrs</span></th>
                <th>STR<br /><span>Qtrs</span></th>
                <th>Bench<br /><span>Qtrs</span></th>
                <th>Captain<br /><span>Gms</span></th>
              </tr></thead>
              <tbody>
                {players.map((player) => {
                  const rows = seasonLineups.filter((item) => item.player_id === player.id)
                  const roleCounts = { GK: 0, DEF: 0, MID: 0, STR: 0 }
                  const captainCount = games.filter((game) => game.captain_1_id === player.id || game.captain_2_id === player.id).length
                  rows.forEach((item) => {
                    const role = item.position === 'Goalkeeper' ? 'GK' : item.position.includes('Defense') ? 'DEF' : item.position.includes('Mid') ? 'MID' : 'STR'
                    roleCounts[role]++
                  })
                  const played = new Set(rows.map((item) => item.quarter)).size
                  const plannedQuarters = new Set(seasonLineups.map((item) => item.quarter)).size
                  const bench = Math.max(0, plannedQuarters - played)
                  return <tr key={player.id}>
                    <td className="player-col" style={{ fontWeight: 700 }}>#{player.jersey_number ?? '-'} {player.name}</td>
                    <td>{played}</td><td>{roleCounts.GK}</td><td>{roleCounts.DEF}</td><td>{roleCounts.MID}</td><td>{roleCounts.STR}</td><td>{bench}</td><td>{captainCount}</td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
        </section>
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

          <div className="add-player-form">
            <input
              type="text"
              placeholder="Player name"
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
            />

            <input
              type="number"
              placeholder="Jersey number"
              value={newPlayerNumber}
              onChange={(e) => setNewPlayerNumber(e.target.value)}
            />

            <div className="form-buttons">
              <button
                className="primary-button"
                onClick={addOrUpdatePlayer}
              >
                {editingPlayerId ? 'Save Player' : 'Add Player'}
              </button>

              {editingPlayerId && (
                <button
                  className="secondary-button"
                  onClick={() => {
                    setEditingPlayerId(null)
                    setNewPlayerName('')
                    setNewPlayerNumber('')
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

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
                    {player.jersey_number ?? '—'}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: '15px' }}>{player.name}</strong>
                    <div className="roster-actions">
                      <button className="secondary-button" onClick={() => editPlayer(player)}>Edit</button>
                      <button className="secondary-button" onClick={() => deletePlayer(player)}>Delete</button>
                    </div>
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
                      <strong>#{player.jersey_number ?? '-'} {player.name}</strong>
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
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '8px', marginTop: '8px' }}>
                            {['GK', 'DEF', 'MID', 'STR'].map((role) => (
                              <label key={role} style={{ display: 'contents' }}>
                                <span style={{ alignSelf: 'center', fontWeight: 600 }}>{role}</span>
                                <select
                                  aria-label={`${role} strength`}
                                  value={String(draft.position_preferences[role] || 0)}
                                  onChange={(e) => setCoachDraft({
                                    ...draft,
                                    position_preferences: { ...draft.position_preferences, [role]: Number(e.target.value) },
                                  })}
                                >
                                  <option value="0">Not rated</option>
                                  <option value="1">1 — Weak</option>
                                  <option value="2">2</option>
                                  <option value="3">3 — Solid</option>
                                  <option value="4">4</option>
                                  <option value="5">5 — Excellent</option>
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
                    }}
                  >
                    {player.jersey_number !== null
                      ? `#${player.jersey_number} `
                      : ''}
                    {player.name}
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
        onBack={() => setScreen('home')}
      />
    )
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
              const saved = await saveLineup(false)

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
              onClick={() => saveLineup(true)}
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
          </div>          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <button
              className="secondary-button"
              onClick={copyPreviousGameLineup}
              disabled={savingLineup || !canManageGame}
            >
              Copy Previous Game
            </button>
          </div>
<div style={{ marginBottom: '12px', padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 8px' }}>Game Captains</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <select value={captain1Id} onChange={(e) => setCaptain1Id(e.target.value)}>
                <option value="">Captain 1</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    #{player.jersey_number ?? '-'} {player.name}
                  </option>
                ))}
              </select>
              <select value={captain2Id} onChange={(e) => setCaptain2Id(e.target.value)}>
                <option value="">Captain 2</option>
                {players.map((player) => (
                  <option key={player.id} value={player.id}>
                    #{player.jersey_number ?? '-'} {player.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="secondary-button" onClick={saveCaptains} disabled={!canManageGame} style={{ marginTop: '8px', width: '100%' }}>
              Save Captains
            </button>
          </div>

          <div style={{ marginBottom: '12px', padding: '12px', border: '1px solid #ddd', borderRadius: '8px' }}>
            <h3 style={{ margin: '0 0 8px' }}>Attendance</h3>
            <div style={{ fontSize: '12px', marginBottom: '8px', opacity: 0.7 }}>
              Set availability before building the quarters. Absent players are unavailable all game. Late players become available starting at their arrival quarter.
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {players.map((player) => {
                const attendance = gameAttendance[player.id] || { status: 'Present' as const, arrival_quarter: null }
                return (
                  <div key={player.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: '6px', alignItems: 'center' }}>
                    <strong>#{player.jersey_number ?? '-'} {player.name}</strong>
                    <select
                      value={attendance.status}
                      disabled={!canManageGame}
                      onChange={(e) => {
                        const nextStatus = e.target.value as 'Present' | 'Absent' | 'Late'
                        saveAttendanceStatus(player.id, nextStatus, nextStatus === 'Late' ? (attendance.arrival_quarter || 2) : null)
                      }}
                    >
                      <option value="Present">Present</option>
                      <option value="Late">Late</option>
                      <option value="Absent">Absent</option>
                    </select>
                    {attendance.status === 'Late' ? (
                      <select
                        value={attendance.arrival_quarter || 2}
                        disabled={!canManageGame}
                        onChange={(e) => saveAttendanceStatus(player.id, 'Late', Number(e.target.value))}
                      >
                        <option value="2">Arrives Q2</option>
                        <option value="3">Arrives Q3</option>
                        <option value="4">Arrives Q4</option>
                      </select>
                    ) : (
                      <span style={{ fontSize: '12px', opacity: 0.6 }}>Available all game</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

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
                          #{player.jersey_number ?? '-'} {player.name}
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
                            `#${player.jersey_number ?? '-'} ${player.name} (${playerQuartersPlayed(player.id)}/4)`
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

          <div className="position-list">
            {positionsForFormation(optimizationFormation).map((position) => {
              const assignment = playerAtPosition(position)

              return (
                <div
                  className="position-row"
                  key={position}
                >
                  <strong>{position}</strong>

                  <select
                    value={assignment?.player_id || ''}
                    disabled={!canManageGame}
                    onChange={(e) => {
                      if (e.target.value) {
                        assignPlayer(
                          e.target.value,
                          position
                        )
                      } else {
                        removePlayerFromPosition(position)
                      }
                    }}
                  >
                    <option value="">
                      Select player
                    </option>

                    {players
                      .filter(
                        (player) =>
                          !lineup.some(
                            (item) =>
                              item.player_id === player.id &&
                              item.position !== position
                          )
                      )
                      .map((player) => {
                        const gkCount =
                          goalkeeperQuarterCount(
                            player.id
                          )

                        return (
                          <option
                            key={player.id}
                            value={player.id}
                            disabled={
                              !playerAvailableForQuarter(player.id, selectedQuarter) ||
                              (position === 'Goalkeeper' && gkCount >= 2)
                            }
                          >
                            #{player.jersey_number}{' '}
                            {player.name}
                            {!playerAvailableForQuarter(player.id, selectedQuarter)
                              ? gameAttendance[player.id]?.status === 'Absent'
                                ? '  ABSENT'
                                : `  AVAILABLE Q${gameAttendance[player.id]?.arrival_quarter || 2}`
                              : position === 'Goalkeeper' && gkCount >= 2
                                ? '  GK LIMIT REACHED'
                                : ''}
                          </option>
                        )
                      })}
                  </select>
                </div>
              )
            })}
          </div>
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
        {screen === 'home' && renderHome()}
        {screen === 'roster' && renderRoster()}
        {screen === 'new-game' && renderNewGame()}
        {screen === 'lineup' && renderLineup()}
        {screen === 'live-game' && renderLiveGame()}
        {screen === 'games' && renderGames()}
        {screen === 'team-rules' && renderTeamRules()}
        {screen === 'coaches' && renderCoaches()}
      </main>

      <nav className="bottom-nav">
        <button onClick={() => setScreen('home')}>

          <span>Home</span>
        </button>

        <button onClick={() => setScreen('roster')}>

          <span>Roster</span>
        </button>

        <button onClick={() => setScreen('games')}>
          <span>Games</span>
        </button>
      </nav>
    </div>
  )
}

export default App
