import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { db } from '../db'
import PageHeader from '../components/PageHeader'
import { formatWeight } from '../weight'
import { deleteWorkout } from '../workouts'

export default function WorkoutDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const workout = useLiveQuery(() => db.workouts.get(id!), [id])
  const sets = useLiveQuery(() => db.sets.where('workoutId').equals(id!).sortBy('order'), [id]) ?? []
  const exercises = useLiveQuery(() => db.exercises.toArray(), []) ?? []

  if (!workout) return null

  const exerciseName = (exerciseId: string) =>
    exercises.find((e) => e.id === exerciseId)?.name ?? 'Unknown'

  async function handleDeleteWorkout() {
    if (!workout || deleting || !window.confirm(`Delete "${workout.name}" from ${workout.date}? This will also delete its logged sets.`)) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteWorkout(workout.id)
      navigate('/history')
    } catch {
      setDeleteError('Could not delete this workout. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <PageHeader title={workout.name} />
      <div className="space-y-3 p-4">
        <p className="text-sm text-neutral-500">{workout.date}</p>
        {workout.isSample && <p className="text-xs text-orange-400">Sample workout · synthetic progress data</p>}
        {workout.exerciseIds.map((exerciseId) => (
          <div key={exerciseId} className="rounded-xl border border-neutral-800 p-3">
            <h3 className="mb-2 font-semibold">{exerciseName(exerciseId)}</h3>
            <ul className="space-y-1 text-sm">
              {sets
                .filter((s) => s.exerciseId === exerciseId)
                .map((s, i) => (
                  <li key={s.id}>
                    Set {i + 1}: {formatWeight(s)} × {s.reps}
                  </li>
                ))}
            </ul>
          </div>
        ))}
        <button onClick={handleDeleteWorkout} disabled={deleting} className="w-full py-3 text-sm text-red-500 disabled:opacity-40">
          {deleting ? 'Deleting…' : 'Delete Workout'}
        </button>
        {deleteError && <p role="alert" className="text-sm text-red-400">{deleteError}</p>}
      </div>
    </div>
  )
}
