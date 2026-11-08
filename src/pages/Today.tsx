import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { v4 as uuid } from 'uuid'
import { db, type Workout } from '../db'
import PageHeader from '../components/PageHeader'
import CloudSyncPanel from '../components/CloudSyncPanel'

export default function Today() {
  const navigate = useNavigate()
  const activeWorkout = useLiveQuery(
    () => db.workouts.filter((w) => !w.finishedAt).first(),
    [],
  )
  const routines = useLiveQuery(() => db.routines.orderBy('name').toArray(), []) ?? []

  async function startWorkout(name: string, routineId?: string, exerciseIds: string[] = []) {
    const workout: Workout = {
      id: uuid(),
      date: new Date().toLocaleDateString('en-CA'),
      name,
      routineId,
      exerciseIds,
    }
    await db.workouts.add(workout)
    navigate(`/workout/${workout.id}`)
  }

  return (
    <div>
      <PageHeader title="Today" />
      <div className="space-y-4 p-4">
        <CloudSyncPanel />
        {activeWorkout && (
          <button
            onClick={() => navigate(`/workout/${activeWorkout.id}`)}
            className="w-full rounded-xl bg-orange-500 px-4 py-3 text-left font-medium text-neutral-950"
          >
            Resume "{activeWorkout.name}" →
          </button>
        )}

        <button
          onClick={() => startWorkout('Workout')}
          disabled={!!activeWorkout}
          className="w-full rounded-xl border border-neutral-700 px-4 py-3 text-left font-medium disabled:opacity-40"
        >
          + Start Blank Workout
        </button>

        <div>
          <h2 className="mb-2 text-sm font-semibold text-neutral-400">Routines</h2>
          {routines.length === 0 && (
            <p className="text-sm text-neutral-500">
              No routines yet. Create one in the Routines tab to start faster.
            </p>
          )}
          <div className="space-y-2">
            {routines.map((r) => (
              <button
                key={r.id}
                onClick={() => startWorkout(r.name, r.id, r.exercises.map((re) => re.exerciseId))}
                disabled={!!activeWorkout}
                className="w-full rounded-xl border border-neutral-700 px-4 py-3 text-left disabled:opacity-40"
              >
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-neutral-500">
                  {r.exercises.reduce((total, exercise) => total + exercise.targetSets, 0)} working sets
                  {' · '}{r.exercises.length} exercises
                  {r.exercises.some((exercise) => exercise.supersetGroup) ? ' · includes superset' : ''}
                </div>
                {r.notes && <div className="mt-1 line-clamp-2 text-left text-xs text-neutral-400">{r.notes}</div>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
