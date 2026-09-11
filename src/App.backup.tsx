import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { supabase } from './supabase'

type Team = {
  id: string
  name: string
  age_group: string
  format: string
  season: string
}

type Player = {
  id: string
  team_id: string
  name: string
  jersey_number: number | null
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
}

type LineupItem = {
  player_id: string
  quarter: number
  position: string
}

const TEAM_ID = '92713845-68a3-4bdc-9455-9d93c24744bf'

const positions = [
  'Goalkeeper',
  'Left Defense',
  'Center Defense',
  'Right Defense',
  'Center Mid',
  'Left Striker',
  'Right Striker',
]

function App() {
  const [team, setTeam] = useState<Team | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [games, setGames] = useState<Game[]>([])

  const [screen, setScreen] = useState<
    'home' | 'roster' | 'new-game' | 'lineup'
  >('home')

  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const [selectedQuarter, setSelectedQuarter] = useState(1)

  const [lineup, setLineup] = useState<LineupItem[]>([])
  const [allGameLineups, setAllGameLineups] = useState<LineupItem[]>([])

  const [loading, setLoading] = useState(true)
  const [savingLineup, setSavingLineup] = useState(false)

  const [newPlayerName, setNewPlayerName] = useState('')
  const [newPlayerNumber, setNewPlayerNumber] = useState('')
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null)

  const [opponent, setOpponent] = useState('')
  const [gameDate, setGameDate] = useState('')
  const [gameTime, setGameTime] = useState('')
  const [location, setLocation] = useState('')
  const [homeAway, setHomeAway] = useState('Home')
  const [gameNotes, setGameNotes] = useState('')

  useEffect(() => {
    loadApp()
  }, [])

  async function loadApp() {
    setLoading(true)

    const [{ data: teamData }, { data: playerData }, { data: gameData }] =
      await Promise.all([
        supabase.from('teams').select('*').eq('id', TEAM_ID).single(),
        supabase
          .from('players')
          .select('*')
          .eq('team_id', TEAM_ID)
          .order('jersey_number', { ascending: false }),
        supabase
          .from('games')
          .select('*')
          .eq('team_id', TEAM_ID)
          .order('game_date', { ascending: true }),
      ])

    setTeam(teamData)
    setPlayers(playerData || [])
    setGames(gameData || [])
    setLoading(false)
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
        team_id: TEAM_ID,
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
        team_id: TEAM_ID,
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

  function assignPlayer(playerId: string, position: string) {
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

  function playerBenchQuarters(playerId: string) {
    let bench = 0

    for (let quarter = 1; quarter <= 4; quarter++) {
      if (!quarterHasLineup(quarter)) continue

      const assignment = playerQuarterAssignment(
        playerId,
        quarter
      )

      if (!assignment) {
        bench++
      }
    }

    return bench
  }

  function playingTimeStatus(playerId: string) {
    const played = playerQuartersPlayed(playerId)
    const plannedQuarters = [1, 2, 3, 4].filter((quarter) =>
      quarterHasLineup(quarter)
    ).length

    if (plannedQuarters < 4) {
      if (played >= 3) {
        return {
          label: 'On Track',
          className: 'playing-time-good',
        }
      }

      if (played === 2) {
        return {
          label: 'Watch',
          className: 'playing-time-watch',
        }
      }

      return {
        label: 'Needs Minutes',
        className: 'playing-time-needs',
      }
    }

    if (played >= 3) {
      return {
        label: 'Good',
        className: 'playing-time-good',
      }
    }

    if (played === 2) {
      return {
        label: 'Watch',
        className: 'playing-time-watch',
      }
    }

    return {
      label: 'Needs Minutes',
      className: 'playing-time-needs',
    }
  }

  const upcomingGames = useMemo(() => {
    return games.filter((game) => game.status !== 'Completed')
  }, [games])

  if (loading) {
    return (
      <div className="app">
        <header className="app-header">
          <div className="header-content">
            <h1>The Ted Lasso Experiment</h1>
            <p>Youth soccer coaching assistant</p>
          </div>
        </header>

        <main className="main-content">
          <p>Loading...</p>
        </main>
      </div>
    )
  }

  function renderHome() {
    return (
      <>
        <section className="welcome">
          <p className="eyebrow">COACH</p>
          <h2>Cody Sowa</h2>
          <p>{team?.name || 'Team'}</p>
        </section>

        <div className="quick-actions">
          <button onClick={() => setScreen('roster')}>
            Roster
          </button>

          <button onClick={() => setScreen('new-game')}>
            New Game
          </button>

          <button
            onClick={() => {
              if (upcomingGames[0]) {
                openLineup(upcomingGames[0])
              } else {
                setScreen('new-game')
              }
            }}
          >
            Build Lineup
          </button>
        </div>

        <section className="team-card">
          <div className="section-header">
            <div>
              <h2>{team?.name}</h2>

              <span>
                {team?.age_group} • {team?.format} • {team?.season}
              </span>
            </div>
          </div>

          <p>{players.length} players on the roster.</p>
        </section>

        <section className="next-game-card">
          <div className="section-header">
            <div>
              <h2>Next Game</h2>
            </div>
          </div>

          {upcomingGames.length > 0 ? (
            <>
              <h3>vs. {upcomingGames[0].opponent}</h3>

              <p>
                {upcomingGames[0].game_date}
                {upcomingGames[0].game_time
                  ? ` • ${upcomingGames[0].game_time}`
                  : ''}
              </p>

              {upcomingGames[0].location && (
                <p>{upcomingGames[0].location}</p>
              )}

              <button
                onClick={() => openLineup(upcomingGames[0])}
              >
                Build Lineup →
              </button>
            </>
          ) : (
            <>
              <h3>No upcoming games</h3>

              <p>
                Create your next game to start building a lineup.
              </p>

              <button onClick={() => setScreen('new-game')}>
                Create Game →
              </button>
            </>
          )}
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
          ← Back
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
              >
                <div>
                  <strong>{player.name}</strong>

                  <div className="roster-actions">
                    <button
                      onClick={() => editPlayer(player)}
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => deletePlayer(player)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <span>
                  {player.jersey_number === null
                    ? ''
                    : `#${player.jersey_number}`}
                </span>
              </div>
            ))}
          </div>
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
          ← Back
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
    return (
      <section className="team-card">
        <div className="section-header">
          <div>
            <h2>Playing Time</h2>
            <span>
              Planned quarters and position history.
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
              minWidth: '520px',
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign: 'left',
                    padding: '10px 6px',
                  }}
                >
                  Player
                </th>

                {[1, 2, 3, 4].map((quarter) => (
                  <th
                    key={quarter}
                    style={{
                      textAlign: 'center',
                      padding: '10px 4px',
                    }}
                  >
                    Q{quarter}
                  </th>
                ))}

                <th
                  style={{
                    textAlign: 'center',
                    padding: '10px 4px',
                  }}
                >
                  Total
                </th>
              </tr>
            </thead>

            <tbody>
              {players.map((player) => {
                const played = playerQuartersPlayed(player.id)
                const bench = playerBenchQuarters(player.id)
                const status = playingTimeStatus(player.id)

                return (
                  <tr key={player.id}>
                    <td
                      style={{
                        padding: '10px 6px',
                        fontWeight: 600,
                      }}
                    >
                      {player.jersey_number !== null
                        ? `#${player.jersey_number} `
                        : ''}
                      {player.name}
                    </td>

                    {[1, 2, 3, 4].map((quarter) => {
                      const assignment =
                        playerQuarterAssignment(
                          player.id,
                          quarter
                        )

                      const quarterPlanned =
                        quarterHasLineup(quarter)

                      return (
                        <td
                          key={quarter}
                          style={{
                            textAlign: 'center',
                            padding: '10px 4px',
                            fontSize: '12px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {assignment
                            ? assignment.position
                                .replace('Goalkeeper', 'GK')
                                .replace('Left Defense', 'LD')
                                .replace('Center Defense', 'CD')
                                .replace('Right Defense', 'RD')
                                .replace('Center Mid', 'CM')
                                .replace('Left Striker', 'LS')
                                .replace('Right Striker', 'RS')
                            : quarterPlanned
                              ? 'Bench'
                              : '—'}
                        </td>
                      )
                    })}

                    <td
                      style={{
                        textAlign: 'center',
                        padding: '10px 4px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <strong>{played}</strong>/4
                      <div
                        style={{
                          fontSize: '11px',
                          marginTop: '3px',
                        }}
                      >
                        {bench} bench
                      </div>

                      <div
                        className={status.className}
                        style={{
                          fontSize: '11px',
                          marginTop: '3px',
                        }}
                      >
                        {status.label}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div
          style={{
            marginTop: '14px',
            fontSize: '12px',
            opacity: 0.7,
          }}
        >
          — = not planned yet • Bench = quarter planned,
          player not assigned
        </div>
      </section>
    )
  }

  function renderPreviousQuarterTable() {
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
                          ? assignment.position
                              .replace('Goalkeeper', 'GK')
                              .replace('Left Defense', 'LD')
                              .replace('Center Defense', 'CD')
                              .replace('Right Defense', 'RD')
                              .replace('Center Mid', 'CM')
                              .replace('Left Striker', 'LS')
                              .replace('Right Striker', 'RS')
                          : 'Bench'}
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

  function renderLineup() {
    if (!selectedGame) return null

    return (
      <>
        <button
          className="back-button"
          onClick={async () => {
            const saved = await saveLineup(false)

            if (!saved) {
              alert('Could not save the current quarter.')
              return
            }

            setScreen('home')
          }}
        >
          ← Back
        </button>

        <section className="team-card">
          <div className="section-header">
            <div>
              <h2>vs. {selectedGame.opponent}</h2>

              <span>
                {selectedGame.game_date}
                {selectedGame.game_time
                  ? ` • ${selectedGame.game_time}`
                  : ''}
              </span>
            </div>

            <button
              className="primary-button"
              onClick={() => saveLineup(true)}
              disabled={savingLineup}
            >
              {savingLineup ? 'Saving...' : 'Save Lineup'}
            </button>
          </div>

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
            {positions.map((position) => {
              const assignment = playerAtPosition(position)

              return (
                <div
                  className="position-row"
                  key={position}
                >
                  <strong>{position}</strong>

                  <select
                    value={assignment?.player_id || ''}
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
                              position === 'Goalkeeper' &&
                              gkCount >= 2
                            }
                          >
                            #{player.jersey_number}{' '}
                            {player.name}
                            {position === 'Goalkeeper' &&
                            gkCount >= 2
                              ? ' — GK LIMIT REACHED'
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

        {renderPreviousQuarterTable()}
      </>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>The Ted Lasso Experiment</h1>
          <p>Youth soccer coaching assistant</p>
        </div>
      </header>

      <main className="main-content">
        {screen === 'home' && renderHome()}
        {screen === 'roster' && renderRoster()}
        {screen === 'new-game' && renderNewGame()}
        {screen === 'lineup' && renderLineup()}
      </main>

      <nav className="bottom-nav">
        <button onClick={() => setScreen('home')}>
          🏠
          <span>Home</span>
        </button>

        <button onClick={() => setScreen('roster')}>
          👥
          <span>Roster</span>
        </button>

        <button
          onClick={() => {
            if (selectedGame) {
              openLineup(selectedGame)
            } else if (upcomingGames[0]) {
              openLineup(upcomingGames[0])
            } else {
              setScreen('new-game')
            }
          }}
        >
          ⚽
          <span>Lineup</span>
        </button>

        <button onClick={() => setScreen('new-game')}>
          ➕
          <span>Game</span>
        </button>
      </nav>
    </div>
  )
}

export default App
