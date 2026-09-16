import { useEffect, useState } from 'react'
import { supabase } from './supabase'

type Player = {
  id: string
  name: string
  jersey_number: number | null
}

type Game = {
  id: string
  opponent: string
  game_date: string
  game_time: string | null
}

type AttendanceStatus = 'Present' | 'Absent' | 'Late'

type AttendanceRecord = {
  status: AttendanceStatus
  arrival_quarter: number | null
}

type AttendanceProps = {
  game: Game
  players: Player[]
  onBack: () => void
}

export default function Attendance({
  game,
  players,
  onBack,
}: AttendanceProps) {
  const [attendance, setAttendance] = useState<
    Record<string, AttendanceRecord>
  >({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadAttendance() {
      const { data, error } = await supabase
        .from('game_attendance')
        .select('*')
        .eq('game_id', game.id)

      if (error) {
        console.error(error)
        alert('Could not load attendance.')
        setLoading(false)
        return
      }

      const loaded: Record<string, AttendanceRecord> = {}

      for (const row of data || []) {
        loaded[row.player_id] = {
          status: row.status,
          arrival_quarter: row.arrival_quarter,
        }
      }

      for (const player of players) {
        if (!loaded[player.id]) {
          loaded[player.id] = {
            status: 'Present',
            arrival_quarter: null,
          }
        }
      }

      setAttendance(loaded)
      setLoading(false)
    }

    loadAttendance()
  }, [game.id, players])

  function setStatus(
    playerId: string,
    status: AttendanceStatus
  ) {
    setAttendance((current) => ({
      ...current,
      [playerId]: {
        status,
        arrival_quarter:
          status === 'Late'
            ? current[playerId]?.arrival_quarter || 2
            : null,
      },
    }))
  }

  function setArrivalQuarter(
    playerId: string,
    quarter: number
  ) {
    setAttendance((current) => ({
      ...current,
      [playerId]: {
        status: 'Late',
        arrival_quarter: quarter,
      },
    }))
  }

  async function saveAttendance() {
    setSaving(true)

    const rows = players.map((player) => ({
      game_id: game.id,
      player_id: player.id,
      status: attendance[player.id]?.status || 'Present',
      arrival_quarter:
        attendance[player.id]?.status === 'Late'
          ? attendance[player.id]?.arrival_quarter || 2
          : null,
    }))

    const { error } = await supabase
      .from('game_attendance')
      .upsert(rows, {
        onConflict: 'game_id,player_id',
      })

    setSaving(false)

    if (error) {
      console.error(error)
      alert('Could not save attendance.')
      return
    }

    alert('Attendance saved.')
  }

  const presentCount = players.filter(
    (player) =>
      (attendance[player.id]?.status || 'Present') ===
      'Present'
  ).length

  const lateCount = players.filter(
    (player) => attendance[player.id]?.status === 'Late'
  ).length

  const absentCount = players.filter(
    (player) => attendance[player.id]?.status === 'Absent'
  ).length

  if (loading) {
    return (
      <main className="app-shell">
        <section className="team-card">
          <p>Loading attendance...</p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="team-card">
        <div className="section-header">
          <div>
            <button
              className="secondary-button"
              onClick={onBack}
              style={{ marginBottom: '10px' }}
            >
              Back
            </button>

            <h2>Game Attendance</h2>

            <span>
              vs. {game.opponent}  {game.game_date}
            </span>
          </div>

          <button
            className="primary-button"
            onClick={saveAttendance}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Attendance'}
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap',
            margin: '18px 0',
          }}
        >
          <strong>Present: {presentCount}</strong>
          <strong>Late: {lateCount}</strong>
          <strong>Absent: {absentCount}</strong>
        </div>

        <div>
          {players.map((player) => {
            const record = attendance[player.id] || {
              status: 'Present' as AttendanceStatus,
              arrival_quarter: null,
            }

            return (
              <div
                key={player.id}
                style={{
                  padding: '14px 0',
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <strong>
                    #{player.jersey_number ?? ''} {player.name}
                  </strong>

                  <div
                    style={{
                      display: 'flex',
                      gap: '6px',
                      flexWrap: 'wrap',
                    }}
                  >
                    {(
                      ['Present', 'Late', 'Absent'] as AttendanceStatus[]
                    ).map((option) => (
                      <button
                        key={option}
                        className={
                          record.status === option
                            ? 'primary-button'
                            : 'secondary-button'
                        }
                        onClick={() =>
                          setStatus(player.id, option)
                        }
                        style={{
                          padding: '7px 10px',
                          fontSize: '12px',
                        }}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                {record.status === 'Late' && (
                  <div
                    style={{
                      marginTop: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span>Available:</span>

                    <select
                      value={record.arrival_quarter || 2}
                      onChange={(e) =>
                        setArrivalQuarter(
                          player.id,
                          Number(e.target.value)
                        )
                      }
                    >
                      <option value={2}>Q2</option>
                      <option value={3}>Q3</option>
                      <option value={4}>Q4</option>
                    </select>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}
