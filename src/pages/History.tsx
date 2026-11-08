import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db'
import PageHeader from '../components/PageHeader'
import { formatWeight } from '../weight'
import { deleteWorkout } from '../workouts'

export default function History() {
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null)
  const workouts =
    useLiveQuery(
      () =>
        db.workouts
          .filter((w) => !!w.finishedAt)
          .reverse()
          .sortBy('date'),
      [],
    ) ?? []
  const sets = useLiveQuery(() => db.sets.toArray(), []) ?? []
  const exercises = useLiveQuery(() => db.exercises.toArray(), []) ?? []

  const exerciseName = (exerciseId: string) =>
    exercises.find((exercise) => exercise.id === exerciseId)?.name ?? 'Unknown exercise'

  async function handleDeleteWorkout(id: string, name: string, date: string) {
    if (deletingId || !window.confirm(`Delete "${name}" from ${date}? This will also delete its logged sets.`)) return
    setDeletingId(id)
    setDeleteError(null)
    try {
      await deleteWorkout(id)
      if (expandedWorkoutId === id) setExpandedWorkoutId(null)
    } catch {
      setDeleteError({ id, message: 'Could not delete this workout. Please try again.' })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <PageHeader title="History" />
      <div className="space-y-2 p-4">
        {workouts.length === 0 && (
          <p className="text-sm text-neutral-500">No finished workouts yet.</p>
        )}
        {workouts
          .slice()
          .reverse()
          .map((w) => {
            const isExpanded = expandedWorkoutId === w.id
            return (
              <section key={w.id} className="overflow-hidden rounded-xl border border-neutral-800">
                <div className="flex items-center pr-2">
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedWorkoutId(isExpanded ? null : w.id)}
                    className="min-w-0 flex-1 px-4 py-3 text-left"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{w.name}</span>
                      <span className="shrink-0 text-xs text-neutral-500">{w.date}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-neutral-500">
                      <span>{w.exerciseIds.length} exercises</span>
                      {w.isSample && <span className="rounded bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-400">Sample</span>}
                      <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${w.name} from ${w.date}`}
                    title="Delete workout"
                    disabled={deletingId !== null}
                    onClick={() => void handleDeleteWorkout(w.id, w.name, w.date)}
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-2 focus-visible:outline-orange-400 disabled:opacity-40"
                  >
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5 6l1 14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-14M10 10v7M14 10v7" />
                    </svg>
                  </button>
                </div>
                {deleteError?.id === w.id && (
                  <p role="alert" className="px-4 pb-3 text-xs text-red-400">{deleteError.message}</p>
                )}
                {isExpanded && (
                  <div className="space-y-3 border-t border-neutral-800 px-4 py-3">
                    {w.exerciseIds.map((exerciseId) => {
                      const exerciseSets = sets
                        .filter((set) => set.workoutId === w.id && set.exerciseId === exerciseId)
                        .sort((a, b) => a.order - b.order)
                      const firstSet = exerciseSets[0]
                      return (
                        <div key={exerciseId}>
                          <h3 className="text-sm font-medium">{exerciseName(exerciseId)}</h3>
                          {firstSet && (
                            <p className="mt-0.5 text-xs text-neutral-500">
                              {exerciseSets.length} {exerciseSets.length === 1 ? 'set' : 'sets'}
                              {' · First set: '}{formatWeight(firstSet)} × {firstSet.reps}
                            </p>
                          )}
                          <ul className="mt-1 space-y-1 text-xs text-neutral-400">
                            {exerciseSets.map((set, index) => (
                              <li key={set.id}>
                                Set {index + 1}: {formatWeight(set)} × {set.reps}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )
                    })}
                    <Link to={`/history/${w.id}`} className="inline-block text-xs text-orange-400">
                      Open workout details
                    </Link>
                  </div>
                )}
              </section>
            )
          })}
      </div>
    </div>
  )
}
