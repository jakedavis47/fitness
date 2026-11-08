import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db, type Exercise } from '../db'
import PageHeader from '../components/PageHeader'

type Metric = 'weight' | 'reps' | 'volume'
type Aggregation = 'total' | 'topSet'

const METRICS: { key: Metric; label: string; unit: string; color: string; aggregatable: boolean }[] = [
  { key: 'weight', label: 'Weight', unit: '', color: '#f97316', aggregatable: false },
  { key: 'reps', label: 'Reps', unit: '', color: '#38bdf8', aggregatable: true },
  { key: 'volume', label: 'Volume', unit: '', color: '#4ade80', aggregatable: true },
]

interface DayStats {
  date: string
  topWeight: number // weight of the top set (first set logged that day)
  topReps: number // reps of the top set
  topVolume: number // weight * reps of just the top set
  totalReps: number // sum of reps across all sets that day
  totalVolume: number // sum of weight * reps across all sets that day
  firstOrder: number // internal: order of the set currently used as the top set
}

export default function Progress() {
  const completedExercises = useLiveQuery(async () => {
    const workoutIds = await db.workouts.filter((workout) => !!workout.finishedAt).primaryKeys()
    if (workoutIds.length === 0) return []

    const sets = await db.sets.where('workoutId').anyOf(workoutIds).toArray()
    const exerciseIds = [...new Set(sets.map((set) => set.exerciseId))]
    const exercises = await db.exercises.bulkGet(exerciseIds)
    return exercises
      .filter((exercise): exercise is Exercise => !!exercise)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [])
  const exercises = completedExercises ?? []
  const [exerciseId, setExerciseId] = useState<string>('')
  const selectedExerciseId = exercises.some((exercise) => exercise.id === exerciseId) ? exerciseId : ''
  const [metric, setMetric] = useState<Metric>('volume')
  const [aggregation, setAggregation] = useState<Aggregation>('total')

  const chartData = useLiveQuery(async () => {
    if (!selectedExerciseId) return []
    const sets = await db.sets.where('exerciseId').equals(selectedExerciseId).toArray()
    const workoutIds = [...new Set(sets.map((s) => s.workoutId))]
    const workouts = await db.workouts.bulkGet(workoutIds)
    const dateByWorkout = new Map(
      workouts.filter((w): w is NonNullable<typeof w> => !!w?.finishedAt).map((w) => [w.id, w.date]),
    )

    const byWorkout = new Map<string, DayStats>()
    for (const s of sets) {
      const date = dateByWorkout.get(s.workoutId)
      if (!date) continue
      let day = byWorkout.get(s.workoutId)
      if (!day) {
        day = {
          date,
          topWeight: 0,
          topReps: 0,
          topVolume: 0,
          totalReps: 0,
          totalVolume: 0,
          firstOrder: Infinity,
        }
        byWorkout.set(s.workoutId, day)
      }
      if (s.order < day.firstOrder) {
        day.firstOrder = s.order
        day.topWeight = s.weight
        day.topReps = s.reps
        day.topVolume = s.weight * s.reps
      }
      day.totalReps += s.reps
      day.totalVolume += s.weight * s.reps
    }

    return [...byWorkout.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [selectedExerciseId]) ?? []

  const activeMetric = METRICS.find((m) => m.key === metric)!

  function valueFor(d: DayStats): number {
    switch (metric) {
      case 'weight':
        return d.topWeight
      case 'reps':
        return aggregation === 'total' ? d.totalReps : d.topReps
      case 'volume':
        return aggregation === 'total' ? d.totalVolume : d.topVolume
    }
  }

  const points = selectedExerciseId ? chartData.map((d) => ({ date: d.date, value: valueFor(d) })) : []

  const best = points.reduce<{ date: string; value: number } | null>((acc, p) => {
    if (!acc || p.value > acc.value) return p
    return acc
  }, null)

  return (
    <div>
      <PageHeader title="Progress" />
      <div className="space-y-4 p-4">
        <select
          value={selectedExerciseId}
          onChange={(e) => setExerciseId(e.target.value)}
          disabled={exercises.length === 0}
          aria-label="Completed exercise"
          className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
        >
          <option value="">
            {completedExercises === undefined ? 'Loading exercises…' : exercises.length === 0
              ? 'No completed exercises yet' : 'Select an exercise…'}
          </option>
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>

        {completedExercises !== undefined && exercises.length === 0 && (
          <p className="text-sm text-neutral-500">
            Log sets and finish a workout to start tracking your progress.
          </p>
        )}

        {selectedExerciseId && (
          <div className="flex flex-wrap gap-2">
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  metric === m.key
                    ? 'border-transparent bg-neutral-100 text-neutral-950'
                    : 'border-neutral-700 text-neutral-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {selectedExerciseId && activeMetric.aggregatable && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Show:</span>
            <div className="flex overflow-hidden rounded-lg border border-neutral-700">
              {(['topSet', 'total'] as Aggregation[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setAggregation(a)}
                  className={`px-3 py-1 text-xs font-medium ${
                    aggregation === a ? 'bg-neutral-100 text-neutral-950' : 'text-neutral-300'
                  }`}
                >
                  {a === 'topSet' ? 'Top Set' : 'Total'}
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedExerciseId && chartData.length === 0 && (
          <p className="text-sm text-neutral-500">No finished workouts logged for this exercise yet.</p>
        )}

        {selectedExerciseId && activeMetric.aggregatable && aggregation === 'topSet' && (
          <p className="text-xs text-neutral-500">
            Top Set uses only the first set you logged that day, so it isn't distorted by whether
            you did 2, 3, or 4 sets.
          </p>
        )}

        {selectedExerciseId && metric === 'volume' && (
          <p className="text-xs text-neutral-500">
            Volume = weight × reps. Total adds the volume of every set for this exercise in each workout.
          </p>
        )}

        {best && (
          <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 p-3">
            <p className="text-xs text-neutral-400">Best {activeMetric.label}</p>
            <p className="text-lg font-semibold text-orange-400">
              {Math.round(best.value * 100) / 100}
              {activeMetric.unit}
            </p>
            <p className="text-xs text-neutral-500">{best.date}</p>
          </div>
        )}

        {points.length > 1 && (
          <div className="h-64 rounded-xl border border-neutral-800 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#a3a3a3' }} />
                <YAxis tick={{ fontSize: 10, fill: '#a3a3a3' }} width={30} />
                <Tooltip
                  contentStyle={{ background: '#171717', border: '1px solid #404040', fontSize: 12 }}
                />
                <Line type="monotone" dataKey="value" stroke={activeMetric.color} strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
