export type Player = {
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

export type TeamRules = {
  max_gk_quarters: number | null
  max_bench_quarters: number | null
  min_quarters_played: number | null
  target_quarters_played: number | null
  require_everyone_play: boolean | null
} | null

export type AttendanceRecord = {
  status: 'Present' | 'Absent' | 'Late'
  arrival_quarter: number | null
  departure_quarter: number | null
  available_quarters?: number[] | null
}

export type LineupItem = {
  player_id: string
  quarter: number
  position: string
}

export type GameSituation = 'Normal' | 'Protect Lead' | 'Need Goal' | 'Development' | 'Pull Back / AYSO Mode'

export type OptimizerInput = {
  players: Player[]
  teamRules: TeamRules
  attendance: Record<string, AttendanceRecord>
  plannedLineups: LineupItem[]
  priorPositionHistory?: LineupItem[]
  priorActualLiveLineups?: LineupItem[]
  gameSituation: GameSituation
  formation: string
  quarter: number
  currentScore?: { ours: number; theirs: number }
  recentGoalScorerIds?: string[]
}

export type RotationAdvice = {
  priority: Player[]
  gk: Player | null
  suggestedLineup: { position: string; player: Player }[]
  warnings: string[]
  message: string
}

export type WholeGamePlan = {
  gamePlan: LineupItem[]
  warnings: string[]
}

export const FORMATIONS_BY_FORMAT: Record<string, string[]> = {
  // Region 50 U8 is 6v6: five field players plus a goalkeeper.
  '5v5': ['2-1-2', '2-2-1', '1-3-1'],
  '6v6': ['2-1-2', '2-2-1', '1-3-1'],
  // Region 50 U10 is 7v7: six field players plus a goalkeeper.
  '7v7': ['3-2-1', '3-1-2', '4-1-1', '2-2-2', '1-2-1-2'],
  // Region 50 U12 is 9v9: eight field players plus a goalkeeper.
  '9v9': ['4-3-1', '4-2-2', '3-4-1', '3-3-2', '2-4-2'],
  // 11v11 standard formations.
  '11v11': ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '3-4-3'],
}

export const optimizationFormations: Record<string, string[]> = {
  // 5v5 / 6v6
  '2-1-2': ['Goalkeeper', 'Left Defense', 'Right Defense', 'Center Mid', 'Left Striker', 'Right Striker'],
  '2-2-1': ['Goalkeeper', 'Left Defense', 'Right Defense', 'Left Mid', 'Right Mid', 'Center Striker'],
  '1-3-1': ['Goalkeeper', 'Center Defense', 'Left Mid', 'Center Mid', 'Right Mid', 'Center Striker'],

  // 7v7
  '3-2-1': ['Goalkeeper', 'Left Defense', 'Center Defense', 'Right Defense', 'Left Mid', 'Right Mid', 'Center Striker'],
  '3-1-2': ['Goalkeeper', 'Left Defense', 'Center Defense', 'Right Defense', 'Center Mid', 'Left Striker', 'Right Striker'],
  '4-1-1': ['Goalkeeper', 'Left Defense', 'Left Center Defense', 'Right Center Defense', 'Right Defense', 'Center Mid', 'Center Striker'],
  '2-2-2': ['Goalkeeper', 'Left Defense', 'Right Defense', 'Left Mid', 'Right Mid', 'Left Striker', 'Right Striker'],
  '1-2-1-2': ['Goalkeeper', 'Center Defense', 'Left Mid', 'Right Mid', 'Center Mid', 'Left Striker', 'Right Striker'],

  // 9v9
  '4-3-1': ['Goalkeeper', 'Left Defense', 'Left Center Defense', 'Right Center Defense', 'Right Defense', 'Left Mid', 'Center Mid', 'Right Mid', 'Center Striker'],
  '4-2-2': ['Goalkeeper', 'Left Defense', 'Left Center Defense', 'Right Center Defense', 'Right Defense', 'Left Mid', 'Right Mid', 'Left Striker', 'Right Striker'],
  '3-4-1': ['Goalkeeper', 'Left Defense', 'Center Defense', 'Right Defense', 'Left Mid', 'Left Center Mid', 'Right Center Mid', 'Right Mid', 'Center Striker'],
  '3-3-2': ['Goalkeeper', 'Left Defense', 'Center Defense', 'Right Defense', 'Left Mid', 'Center Mid', 'Right Mid', 'Left Striker', 'Right Striker'],
  '2-4-2': ['Goalkeeper', 'Left Defense', 'Right Defense', 'Left Mid', 'Left Center Mid', 'Right Center Mid', 'Right Mid', 'Left Striker', 'Right Striker'],

  // 11v11
  '4-4-2': ['Goalkeeper', 'Left Defense', 'Left Center Defense', 'Right Center Defense', 'Right Defense', 'Left Mid', 'Left Center Mid', 'Right Center Mid', 'Right Mid', 'Left Striker', 'Right Striker'],
  '4-3-3': ['Goalkeeper', 'Left Defense', 'Left Center Defense', 'Right Center Defense', 'Right Defense', 'Left Mid', 'Center Mid', 'Right Mid', 'Left Forward', 'Center Forward', 'Right Forward'],
  '4-2-3-1': ['Goalkeeper', 'Left Defense', 'Left Center Defense', 'Right Center Defense', 'Right Defense', 'Left Center Mid', 'Right Center Mid', 'Left Forward', 'Center Forward', 'Right Forward', 'Center Striker'],
  '3-5-2': ['Goalkeeper', 'Left Defense', 'Center Defense', 'Right Defense', 'Left Mid', 'Left Center Mid', 'Center Mid', 'Right Center Mid', 'Right Mid', 'Left Striker', 'Right Striker'],
  '3-4-3': ['Goalkeeper', 'Left Defense', 'Center Defense', 'Right Defense', 'Left Mid', 'Left Center Mid', 'Right Center Mid', 'Right Mid', 'Left Forward', 'Center Forward', 'Right Forward'],
}

export const formationRows: Record<string, string[][]> = {
  '2-1-2': [['Left Striker', 'Right Striker'], ['Center Mid'], ['Left Defense', 'Right Defense'], ['Goalkeeper']],
  '2-2-1': [['Center Striker'], ['Left Mid', 'Right Mid'], ['Left Defense', 'Right Defense'], ['Goalkeeper']],
  '1-3-1': [['Center Striker'], ['Left Mid', 'Center Mid', 'Right Mid'], ['Center Defense'], ['Goalkeeper']],
  '3-2-1': [['Center Striker'], ['Left Mid', 'Right Mid'], ['Left Defense', 'Center Defense', 'Right Defense'], ['Goalkeeper']],
  '3-1-2': [['Left Striker', 'Right Striker'], ['Center Mid'], ['Left Defense', 'Center Defense', 'Right Defense'], ['Goalkeeper']],
  '4-1-1': [['Center Striker'], ['Center Mid'], ['Left Defense', 'Left Center Defense', 'Right Center Defense', 'Right Defense'], ['Goalkeeper']],
  '2-2-2': [['Left Striker', 'Right Striker'], ['Left Mid', 'Right Mid'], ['Left Defense', 'Right Defense'], ['Goalkeeper']],
  '1-2-1-2': [['Left Striker', 'Right Striker'], ['Center Mid'], ['Left Mid', 'Right Mid'], ['Center Defense'], ['Goalkeeper']],
  '4-3-1': [['Center Striker'], ['Left Mid', 'Center Mid', 'Right Mid'], ['Left Defense', 'Left Center Defense', 'Right Center Defense', 'Right Defense'], ['Goalkeeper']],
  '4-2-2': [['Left Striker', 'Right Striker'], ['Left Mid', 'Right Mid'], ['Left Defense', 'Left Center Defense', 'Right Center Defense', 'Right Defense'], ['Goalkeeper']],
  '3-4-1': [['Center Striker'], ['Left Mid', 'Left Center Mid', 'Right Center Mid', 'Right Mid'], ['Left Defense', 'Center Defense', 'Right Defense'], ['Goalkeeper']],
  '3-3-2': [['Left Striker', 'Right Striker'], ['Left Mid', 'Center Mid', 'Right Mid'], ['Left Defense', 'Center Defense', 'Right Defense'], ['Goalkeeper']],
  '2-4-2': [['Left Striker', 'Right Striker'], ['Left Mid', 'Left Center Mid', 'Right Center Mid', 'Right Mid'], ['Left Defense', 'Right Defense'], ['Goalkeeper']],
  '4-4-2': [['Left Striker', 'Right Striker'], ['Left Mid', 'Left Center Mid', 'Right Center Mid', 'Right Mid'], ['Left Defense', 'Left Center Defense', 'Right Center Defense', 'Right Defense'], ['Goalkeeper']],
  '4-3-3': [['Left Forward', 'Center Forward', 'Right Forward'], ['Left Mid', 'Center Mid', 'Right Mid'], ['Left Defense', 'Left Center Defense', 'Right Center Defense', 'Right Defense'], ['Goalkeeper']],
  '4-2-3-1': [['Center Striker'], ['Left Forward', 'Center Forward', 'Right Forward'], ['Left Center Mid', 'Right Center Mid'], ['Left Defense', 'Left Center Defense', 'Right Center Defense', 'Right Defense'], ['Goalkeeper']],
  '3-5-2': [['Left Striker', 'Right Striker'], ['Left Mid', 'Left Center Mid', 'Center Mid', 'Right Center Mid', 'Right Mid'], ['Left Defense', 'Center Defense', 'Right Defense'], ['Goalkeeper']],
  '3-4-3': [['Left Forward', 'Center Forward', 'Right Forward'], ['Left Mid', 'Left Center Mid', 'Right Center Mid', 'Right Mid'], ['Left Defense', 'Center Defense', 'Right Defense'], ['Goalkeeper']],
}

export function getFormationsForFormat(format: string): string[] {
  return FORMATIONS_BY_FORMAT[format] ?? FORMATIONS_BY_FORMAT['7v7']
}

export function getDefaultFormationForFormat(format: string): string {
  return getFormationsForFormat(format)[0]
}

function playerAvailableForQuarter(attendance: Record<string, AttendanceRecord>, playerId: string, quarter: number) {
  const record = attendance[playerId]
  if (!record) return true
  if (Array.isArray(record.available_quarters)) return record.available_quarters.includes(quarter)
  if (record.status === 'Present') return true
  if (record.status === 'Absent') return false
  if (quarter < (record.arrival_quarter || 2)) return false
  if (record.departure_quarter !== null && quarter > record.departure_quarter) return false
  return true
}

function roleForPosition(position: string) {
  if (position === 'Goalkeeper') return 'GK'
  if (position.includes('Defense')) return 'DEF'
  if (position.includes('Mid')) return 'MID'
  if (position.includes('Striker') || position.includes('Forward')) return 'STR'
  return 'MID'
}

function effectiveHistory(input: OptimizerInput) {
  const planned = [...input.plannedLineups, ...(input.priorPositionHistory || [])]
  const actual = input.priorActualLiveLineups || []
  if (actual.length === 0) return planned

  const actualQuarters = new Set(actual.map((item) => item.quarter))
  return [...planned.filter((item) => !actualQuarters.has(item.quarter)), ...actual]
}

export function getRotationAdvice(input: OptimizerInput): RotationAdvice {
  const history = effectiveHistory(input)
  const available = input.players.filter((player) => playerAvailableForQuarter(input.attendance, player.id, input.quarter))
  const comfortablyAhead = (input.currentScore?.ours ?? 0) - (input.currentScore?.theirs ?? 0) >= 3
  const recentGoalScorers = new Set(input.recentGoalScorerIds || [])

  if (available.length === 0) {
    return { priority: [], gk: null, suggestedLineup: [], warnings: [], message: 'No players are available for this quarter.' }
  }

  const priorPlayerStats = (playerId: string) => {
    const prior = history.filter((item) => item.player_id === playerId && item.quarter < input.quarter)
    const played = new Set(prior.map((item) => item.quarter)).size
    const plannedPriorQuarters = history.filter((item) => item.quarter < input.quarter).reduce((set, item) => set.add(item.quarter), new Set<number>())
    const bench = Math.max(0, plannedPriorQuarters.size - played)
    const gk = prior.filter((item) => item.position === 'Goalkeeper').length
    const last = [...prior].sort((a, b) => b.quarter - a.quarter)[0]
    return { played, bench, gk, lastPosition: last?.position || null }
  }

  const priorityScore = (player: Player) => {
    const stats = priorPlayerStats(player.id)
    const priorityBonus: Record<string, number> = { Core: 100, Regular: 20, Development: 0, Situational: 10, Limited: -40 }
    const toleranceBonus: Record<string, number> = { Minimal: stats.bench * -20, Normal: stats.bench * -5, Flexible: stats.bench * 5 }
    return priorityBonus[player.usage_priority || 'Regular'] + toleranceBonus[player.bench_tolerance || 'Normal'] - stats.played * 15 + stats.bench * 4
  }

  const quarterHasLineup = (quarter: number) => history.some((item) => item.quarter === quarter)
  const playerQuarterAssignment = (playerId: string, quarter: number) => history.find((item) => item.player_id === playerId && item.quarter === quarter)
  const benchStreakBefore = (playerId: string) => {
    let streak = 0
    for (let quarter = input.quarter - 1; quarter >= 1; quarter -= 1) {
      if (!quarterHasLineup(quarter)) break
      if (playerQuarterAssignment(playerId, quarter)) break
      streak += 1
    }
    return streak
  }

  const situationRoleBonus = (role: string) => {
    if (input.gameSituation === 'Protect Lead') return role === 'GK' ? 45 : role === 'DEF' ? 35 : role === 'MID' ? 10 : -10
    if (input.gameSituation === 'Need Goal') return role === 'STR' ? 110 : role === 'MID' ? 80 : role === 'DEF' ? -20 : -100
    if (input.gameSituation === 'Development') return role === 'GK' ? 5 : 0
    if (input.gameSituation === 'Pull Back / AYSO Mode') return role === 'GK' ? 85 : role === 'DEF' ? 70 : role === 'MID' ? -15 : -95
    return 0
  }

  const situationPriorityBonus = (player: Player) => {
    if (input.gameSituation === 'Development') {
      if (player.usage_priority === 'Development') return 55
      if (player.usage_priority === 'Core') return -15
    }
    if (input.gameSituation === 'Pull Back / AYSO Mode') {
      if (player.usage_priority === 'Core') return -15
      if (player.usage_priority === 'Development') return 45
      if (player.usage_priority === 'Regular') return 15
    }
    return 0
  }

  const priority = [...available].sort((a, b) => priorityScore(b) - priorityScore(a)).slice(0, Math.min(3, available.length))
  const warnings: string[] = []
  input.players.forEach((player) => {
    const streak = benchStreakBefore(player.id)
    if (streak >= 2 && playerAvailableForQuarter(input.attendance, player.id, input.quarter)) {
      warnings.push(`#${player.jersey_number ?? '-'} ${player.name} has ${streak} consecutive bench quarters.`)
    }
  })

  const suggestedLineup: { position: string; player: Player }[] = []
  const used = new Set<string>()
  const candidateScore = (player: Player, position: string) => {
    const role = roleForPosition(position)
    const stats = priorPlayerStats(player.id)
    const rating = Number(player.position_preferences?.[role] || 0)
    const lastPositionBonus = stats.lastPosition === position ? 8 : 0
    const lastRoleBonus = stats.lastPosition && roleForPosition(stats.lastPosition) === role ? 3 : 0
    const benchStreak = benchStreakBefore(player.id)
    const maxBench = input.teamRules?.max_bench_quarters ?? 2
    const benchFairnessBonus = stats.bench * 180
    const consecutiveBenchBonus = benchStreak > 0 ? 250 : 0
    const doubleBenchBonus = benchStreak >= 2 ? 12000 : 0
    const maxBenchProtectionBonus = stats.bench >= maxBench ? 8000 : 0
    const targetNeed = Math.max(0, (input.teamRules?.target_quarters_played ?? 3) - stats.played) * 12
    const minimumNeed = Math.max(0, (input.teamRules?.min_quarters_played ?? 0) - stats.played) * 25
    const priorityBonus: Record<string, number> = { Core: 100, Regular: 20, Development: 0, Situational: 10, Limited: -40 }
    const toleranceBonus: Record<string, number> = { Minimal: stats.bench * -20, Normal: stats.bench * -5, Flexible: stats.bench * 5 }
    const attackingFit = Math.max(Number(player.position_preferences?.STR || 0), Number(player.position_preferences?.MID || 0))
    const needGoalAdjustment = input.gameSituation === 'Need Goal'
      ? role === 'GK' && attackingFit >= 4 ? -300
        : role === 'DEF' && attackingFit >= 4 ? -180
          : role === 'STR' && attackingFit >= 4 ? 170
            : role === 'MID' && attackingFit >= 4 ? 120
              : 0
      : 0
    const needGoalScorerBonus = input.gameSituation === 'Need Goal' && recentGoalScorers.has(player.id)
      ? role === 'STR' ? 90 : role === 'MID' ? 50 : 0
      : 0
    const pullBackRoleAdjustment = input.gameSituation === 'Pull Back / AYSO Mode'
      ? (() => {
          const attackFit = Math.max(
            Number(player.position_preferences?.STR || 0),
            Number(player.position_preferences?.MID || 0)
          )
          const defenseFit = Math.max(
            Number(player.position_preferences?.DEF || 0),
            Number(player.position_preferences?.GK || 0)
          )
          const scorerAdjustment = comfortablyAhead && recentGoalScorers.has(player.id)
            ? (role === 'STR' ? -90 : role === 'MID' ? -35 : 0)
            : 0

          if (role === 'STR') return scorerAdjustment - attackFit * 32 + defenseFit * 18
          if (role === 'MID') return scorerAdjustment - attackFit * 16 + defenseFit * 8
          if (role === 'DEF') return attackFit * 28 + defenseFit * 12
          return attackFit * 12 + Number(player.position_preferences?.GK || 0) * 25
        })()
      : 0
    const pullBackRecentScorerBlocked =
      input.gameSituation === 'Pull Back / AYSO Mode' &&
      comfortablyAhead &&
      recentGoalScorers.has(player.id) &&
      role === 'STR'

    if (pullBackRecentScorerBlocked) {
      return null
    }

    const coachFitScore = rating * 55
    return coachFitScore + situationRoleBonus(role) + situationPriorityBonus(player) + needGoalAdjustment + needGoalScorerBonus + pullBackRoleAdjustment + priorityBonus[player.usage_priority || 'Regular'] + toleranceBonus[player.bench_tolerance || 'Normal'] + targetNeed + minimumNeed + lastPositionBonus + lastRoleBonus + benchFairnessBonus + consecutiveBenchBonus + doubleBenchBonus + maxBenchProtectionBonus - stats.played * 15
  }

  const chooseBest = (position: string) => available
    .filter((player) => !used.has(player.id))
    .filter((player) => !(player.avoid_positions || []).includes(roleForPosition(position)))
    .filter((player) => !(player.avoid_positions || []).includes(position))
    .filter((player) => position !== 'Goalkeeper' || priorPlayerStats(player.id).gk < (input.teamRules?.max_gk_quarters ?? 2))
    .map((player) => ({ player, score: candidateScore(player, position) }))
    .filter((candidate): candidate is { player: Player; score: number } => candidate.score !== null)
    .sort((a, b) => {
      const scoreDiff = b.score - a.score
      return scoreDiff !== 0 ? scoreDiff : priorPlayerStats(a.player.id).played - priorPlayerStats(b.player.id).played
    })[0]?.player

  const formationPositions = optimizationFormations[input.formation] || optimizationFormations['3-1-2']

  const positionOrder = [...formationPositions].sort((a, b) => {
    const roleRank = (position: string) => {
      const role = roleForPosition(position)
      if (input.gameSituation === 'Need Goal') {
        return role === 'STR' ? 0 : role === 'MID' ? 1 : role === 'DEF' ? 2 : 3
      }
      if (input.gameSituation === 'Pull Back / AYSO Mode') {
        return role === 'GK' ? 0 : role === 'DEF' ? 1 : role === 'MID' ? 2 : 3
      }
      if (input.gameSituation === 'Protect Lead') {
        return role === 'GK' ? 0 : role === 'DEF' ? 1 : role === 'MID' ? 2 : 3
      }
      return role === 'GK' ? 0 : role === 'DEF' ? 1 : role === 'MID' ? 2 : 3
    }
    return roleRank(a) - roleRank(b)
  })

  for (const position of positionOrder) {
    const player = chooseBest(position)
    if (player) {
      suggestedLineup.push({ position, player })
      used.add(player.id)
    }
  }

  // Formation integrity pass:
  // The selected formation defines the exact position slots. If the normal
  // scoring pass could not fill one, make a second pass using any unused
  // available player before giving up. This prevents a 2-2-2 suggestion from
  // silently becoming 2-1-3, etc.
  const missingPositions = formationPositions.filter(
    (position) => !suggestedLineup.some((item) => item.position === position),
  )

  for (const position of missingPositions) {
    const role = roleForPosition(position)
    const maxGk = input.teamRules?.max_gk_quarters ?? 2

    const fallbackCandidates = available
      .filter((player) => !used.has(player.id))
      .filter(
        (player) =>
          position !== 'Goalkeeper' ||
          priorPlayerStats(player.id).gk < maxGk,
      )
      .map((player) => ({
        player,
        score: candidateScore(player, position),
      }))
      .filter(
        (candidate): candidate is { player: Player; score: number } =>
          candidate.score !== null && Number.isFinite(candidate.score),
      )
      .sort((a, b) => b.score - a.score)

    const preferred = fallbackCandidates.find(
      ({ player }) =>
        !(player.avoid_positions || []).includes(role) &&
        !(player.avoid_positions || []).includes(position),
    )
    const fallback = preferred || fallbackCandidates[0]

    if (fallback) {
      if (
        (fallback.player.avoid_positions || []).includes(role) ||
        (fallback.player.avoid_positions || []).includes(position)
      ) {
        warnings.push(
          `Q${input.quarter}: ${fallback.player.name} was used in ${position} as a last resort to preserve the ${input.formation} formation.`,
        )
      }
      suggestedLineup.push({ position, player: fallback.player })
      used.add(fallback.player.id)
    }
  }

  suggestedLineup.sort(
    (a, b) => formationPositions.indexOf(a.position) - formationPositions.indexOf(b.position)
  )

  const gk = suggestedLineup.find((item) => item.position === 'Goalkeeper')?.player || null
  const maxBench = input.teamRules?.max_bench_quarters ?? 2
  const overBenchPlayers = available.filter((player) => priorPlayerStats(player.id).bench >= maxBench)
  if (overBenchPlayers.length > 0) warnings.push(`${overBenchPlayers.length} available player${overBenchPlayers.length === 1 ? '' : 's'} already have ${maxBench}+ bench quarters.`)

  const slotCount = (optimizationFormations[input.formation] || optimizationFormations['3-1-2']).length
  const message = available.length < slotCount
    ? `Only ${available.length} players are available. Suggestion fills as many positions as possible while respecting coach input and team rules.`
    : 'Suggestion balances coach knowledge, rotation fairness, bench streaks, attendance, GK limits, team rules, and position history.'
  return { priority, gk, suggestedLineup, warnings, message }
}

export function optimizeWholeGame(input: OptimizerInput): WholeGamePlan {
  const warnings: string[] = []
  const gamePlan: LineupItem[] = []
  type Role = 'GK' | 'DEF' | 'MID' | 'STR'
  const roleForPositionTyped = (position: string): Role => position === 'Goalkeeper' ? 'GK' : position.includes('Defense') ? 'DEF' : position.includes('Mid') ? 'MID' : 'STR'
  const roleRating = (player: Player, role: Role) => Number(player.position_preferences?.[role] || 0)
  const priorityBonus: Record<string, number> = { Core: 150, Regular: 30, Development: 0, Situational: 20, Limited: -60 }
  const toleranceBonus: Record<string, number> = { Minimal: -35, Normal: -5, Flexible: 15 }
  const comfortablyAhead = (input.currentScore?.ours ?? 0) - (input.currentScore?.theirs ?? 0) >= 3
  const recentGoalScorers = new Set(input.recentGoalScorerIds || [])
  const strongRolesFor = (player: Player) => (['GK', 'DEF', 'MID', 'STR'] as const).filter((role) => roleRating(player, role) >= 4)
  const statsFor = (playerId: string, quarter: number) => {
    const history = gamePlan.filter((item) => item.player_id === playerId && item.quarter < quarter)
    const playedQuarters = new Set(history.map((item) => item.quarter))
    const plannedQuarters = new Set(gamePlan.filter((item) => item.quarter < quarter).map((item) => item.quarter))
    const bench = Math.max(0, plannedQuarters.size - playedQuarters.size)
    const gk = history.filter((item) => item.position === 'Goalkeeper').length
    const roleCounts: Record<Role, number> = { GK: 0, DEF: 0, MID: 0, STR: 0 }
    history.forEach((item) => { roleCounts[roleForPositionTyped(item.position)] += 1 })
    const last = [...history].sort((a, b) => b.quarter - a.quarter)[0]
    return { played: playedQuarters.size, bench, gk, roleCounts, lastPosition: last?.position || null }
  }
  const benchStreak = (playerId: string, quarter: number) => {
    let streak = 0
    for (let q = quarter - 1; q >= 1; q -= 1) {
      const quarterPlan = gamePlan.filter((item) => item.quarter === q)
      if (quarterPlan.length === 0 || quarterPlan.some((item) => item.player_id === playerId)) break
      streak += 1
    }
    return streak
  }
  const situationFit = (player: Player, role: Role) => {
    const gk = roleRating(player, 'GK'), def = roleRating(player, 'DEF'), mid = roleRating(player, 'MID'), str = roleRating(player, 'STR')
    if (input.gameSituation === 'Need Goal') return role === 'STR' ? str * 85 + mid * 35 : role === 'MID' ? mid * 65 + str * 40 : role === 'DEF' ? def * 25 : gk * 45
    if (input.gameSituation === 'Protect Lead') return role === 'GK' ? gk * 50 + def * 20 : role === 'DEF' ? def * 50 + gk * 10 : role === 'MID' ? mid * 35 + def * 20 : str * 15 + def * 10
    if (input.gameSituation === 'Pull Back / AYSO Mode') return role === 'GK' ? gk * 65 + def * 30 : role === 'DEF' ? def * 70 + gk * 15 : role === 'MID' ? mid * 20 + def * 35 : str * 10 + mid * 10 - def * 20
    return roleRating(player, role) * 35
  }
  const playerSituationBonus = (player: Player) => {
    if (input.gameSituation === 'Development') return player.usage_priority === 'Development' ? 80 : player.usage_priority === 'Core' ? -20 : 0
    if (input.gameSituation === 'Pull Back / AYSO Mode') return player.usage_priority === 'Core' ? -35 : player.usage_priority === 'Development' ? 45 : 0
    return 0
  }

  for (let quarter = 1; quarter <= 4; quarter += 1) {
    const available = input.players.filter((player) => playerAvailableForQuarter(input.attendance, player.id, quarter))
    const used = new Set<string>()
    const formationPositions = optimizationFormations[input.formation] || optimizationFormations['3-1-2']
    const remainingPositions = [...formationPositions]
    const score = (player: Player, position: string) => {
      const role = roleForPositionTyped(position), stats = statsFor(player.id, quarter), strongRoles = strongRolesFor(player)
      const roleAlreadyUsed = stats.roleCounts[role] > 0
      const unusedStrongRoles = strongRoles.filter((candidateRole) => stats.roleCounts[candidateRole] === 0)
      const streak = benchStreak(player.id, quarter)
      const maxBench = input.teamRules?.max_bench_quarters ?? 2
      const benchFairness = stats.bench * 180
      const consecutiveBenchProtection = streak > 0 ? 250 : 0
      const doubleBenchProtection = streak >= 2 ? 12000 : 0
      const maxBenchProtection = stats.bench >= maxBench ? 8000 : 0
      const need = Math.max(0, (input.teamRules?.target_quarters_played ?? 3) - stats.played) * 22
      const minimumNeed = Math.max(0, (input.teamRules?.min_quarters_played ?? 0) - stats.played) * 40
      const roleDiversity = strongRoles.length > 1 && !roleAlreadyUsed ? 95 : 0
      const repeatedRolePenalty = strongRoles.length > 1 && roleAlreadyUsed && unusedStrongRoles.length > 0 ? -120 : 0
      const lastPositionBonus = stats.lastPosition === position ? 10 : 0
      const lastRoleBonus = stats.lastPosition && roleForPositionTyped(stats.lastPosition) === role ? 5 : 0
      const avoid = (player.avoid_positions || []).includes(role) || (player.avoid_positions || []).includes(position)
      if (avoid || (position === 'Goalkeeper' && stats.gk >= (input.teamRules?.max_gk_quarters ?? 2))) return -100000
      let special = 0
      if (input.gameSituation === 'Need Goal') {
        const attackingFit = Math.max(roleRating(player, 'STR'), roleRating(player, 'MID'))
        if (role === 'GK' && attackingFit >= 4) special -= 300
        if (role === 'DEF' && attackingFit >= 4) special -= 180
        if (role === 'STR' && attackingFit >= 4) special += 170
        if (role === 'MID' && attackingFit >= 4) special += 120
        if (recentGoalScorers.has(player.id)) {
          if (role === 'STR') special += 90
          if (role === 'MID') special += 50
        }
      }
      if (input.gameSituation === 'Pull Back / AYSO Mode') {
        if (role === 'GK' && roleRating(player, 'GK') >= 4) special += 100
        if (role === 'DEF' && roleRating(player, 'DEF') >= 4) special += 120
        if (role === 'STR' && roleRating(player, 'DEF') >= 4) special -= 140
        if (comfortablyAhead && recentGoalScorers.has(player.id)) {
          if (role === 'STR') special -= 170
          if (role === 'MID') special -= 70
        }
      }
      return situationFit(player, role) + special + playerSituationBonus(player) + priorityBonus[player.usage_priority || 'Regular'] + toleranceBonus[player.bench_tolerance || 'Normal'] + need + minimumNeed + roleDiversity + repeatedRolePenalty + lastPositionBonus + lastRoleBonus + benchFairness + consecutiveBenchProtection + doubleBenchProtection + maxBenchProtection - stats.played * 18 - stats.bench * 3
    }
    while (remainingPositions.length > 0) {
      let best: { player: Player; position: string; score: number } | null = null
      for (const position of remainingPositions) for (const player of available) {
        if (used.has(player.id)) continue
        const candidateScore = score(player, position)
        if (candidateScore > -90000 && (!best || candidateScore > best.score)) best = { player, position, score: candidateScore }
      }
      if (!best) break
      gamePlan.push({ player_id: best.player.id, quarter, position: best.position })
      used.add(best.player.id)
      remainingPositions.splice(remainingPositions.indexOf(best.position), 1)
    }
    if (available.length >= formationPositions.length && gamePlan.filter((item) => item.quarter === quarter).length < formationPositions.length) warnings.push(`Q${quarter}: could not fill every position with the current coach rules.`)
  }

  for (const player of input.players) {
    const strongRoles = strongRolesFor(player)
    if (strongRoles.length < 2) continue
    const playerItems = gamePlan.filter((item) => item.player_id === player.id)
    if (playerItems.length < 2) continue
    const counts: Record<Role, number> = { GK: 0, DEF: 0, MID: 0, STR: 0 }
    playerItems.forEach((item) => { counts[roleForPositionTyped(item.position)] += 1 })
    const desiredRoles = strongRoles.filter((role) => counts[role] === 0).sort((a, b) => roleRating(player, b) - roleRating(player, a))
    for (const desiredRole of desiredRoles) {
      const repeatedRole = strongRoles.filter((role) => counts[role] > 1).sort((a, b) => counts[b] - counts[a])[0]
      if (!repeatedRole) break
      const targetItem = playerItems.find((item) => roleForPositionTyped(item.position) === repeatedRole && item.position !== 'Goalkeeper')
      if (!targetItem) continue
      const candidates = gamePlan.filter((item) => item.quarter === targetItem.quarter)
        .map((item) => ({ item, other: input.players.find((candidate) => candidate.id === item.player_id) }))
        .filter((entry): entry is { item: LineupItem; other: Player } => Boolean(entry.other))
        .filter(({ item, other }) => !(player.avoid_positions || []).includes(desiredRole) && !(other.avoid_positions || []).includes(repeatedRole) && !(other.avoid_positions || []).includes(item.position) && !(item.position === 'Goalkeeper' && statsFor(other.id, targetItem.quarter).gk >= (input.teamRules?.max_gk_quarters ?? 2)))
        .map(({ item, other }) => ({ item, loss: roleRating(other, repeatedRole) - roleRating(other, desiredRole) - (roleRating(player, desiredRole) - roleRating(player, repeatedRole)) }))
        .sort((a, b) => a.loss - b.loss)
      if (candidates.length > 0 && candidates[0].loss < 35) {
        const swap = candidates[0]
        targetItem.player_id = swap.item.player_id
        swap.item.player_id = player.id
        counts[repeatedRole] -= 1
        counts[desiredRole] += 1
      }
    }
  }

  for (const player of input.players) for (let quarter = 2; quarter <= 4; quarter += 1) {
    if (!playerAvailableForQuarter(input.attendance, player.id, quarter)) continue
    const previousPlayed = gamePlan.some((item) => item.quarter === quarter - 1 && item.player_id === player.id)
    const currentPlayed = gamePlan.some((item) => item.quarter === quarter && item.player_id === player.id)
    if (previousPlayed || currentPlayed) continue
    const swaps = gamePlan.filter((item) => item.quarter === quarter)
      .map((item) => ({ item, other: input.players.find((candidate) => candidate.id === item.player_id) }))
      .filter((entry): entry is { item: LineupItem; other: Player } => Boolean(entry.other))
      .filter(({ item, other }) => {
        const role = roleForPositionTyped(item.position)
        return !(player.avoid_positions || []).includes(role) && !(player.avoid_positions || []).includes(item.position) && !(other.avoid_positions || []).includes(role) && !(other.avoid_positions || []).includes(item.position) && !(item.position === 'Goalkeeper' && statsFor(player.id, quarter).gk >= (input.teamRules?.max_gk_quarters ?? 2))
      })
      .map(({ item, other }) => ({ item, cost: roleRating(other, roleForPositionTyped(item.position)) - roleRating(player, roleForPositionTyped(item.position)) }))
      .sort((a, b) => a.cost - b.cost)
    if (swaps.length > 0 && swaps[0].cost <= 1) swaps[0].item.player_id = player.id
  }

  const seenPlayers = new Set<string>(), seenPositions = new Set<string>()
  const normalized = gamePlan.filter((item) => {
    const playerKey = `${item.quarter}:${item.player_id}`, positionKey = `${item.quarter}:${item.position}`
    if (seenPlayers.has(playerKey) || seenPositions.has(positionKey)) {
      warnings.push(`Q${item.quarter}: removed a duplicate assignment from the suggested plan.`)
      return false
    }
    seenPlayers.add(playerKey); seenPositions.add(positionKey)
    return true
  })
  gamePlan.splice(0, gamePlan.length, ...normalized)
  for (const player of input.players) {
    const played = new Set(gamePlan.filter((item) => item.player_id === player.id).map((item) => item.quarter)).size
    const bench = Math.max(0, 4 - played)
    if (bench > (input.teamRules?.max_bench_quarters ?? 2)) warnings.push(`#${player.jersey_number ?? '-'} ${player.name}: ${bench} bench quarters in the suggested plan.`)
    for (let q = 2; q <= 4; q += 1) if (!gamePlan.some((item) => item.quarter === q && item.player_id === player.id) && !gamePlan.some((item) => item.quarter === q - 1 && item.player_id === player.id) && playerAvailableForQuarter(input.attendance, player.id, q)) warnings.push(`#${player.jersey_number ?? '-'} ${player.name}: back-to-back bench Q${q - 1}/Q${q}.`)
  }
  return { gamePlan, warnings }
}
