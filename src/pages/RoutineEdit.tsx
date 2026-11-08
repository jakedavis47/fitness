import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { v4 as uuid } from 'uuid'
import { db, type Exercise, type Routine, type RoutineExercise } from '../db'
import PageHeader from '../components/PageHeader'
import ExercisePicker from '../components/ExercisePicker'

const DEFAULT_TARGET: Omit<RoutineExercise, 'exerciseId'> = {
  targetSets: 2,
  minReps: 8,
  maxReps: 12,
  restSeconds: 120,
}

export default function RoutineEdit() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const existing = useLiveQuery(() => (isNew ? undefined : db.routines.get(id!)), [id])

  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [routineExercises, setRoutineExercises] = useState<RoutineExercise[]>([])
  const exercises = useLiveQuery(() => db.exercises.toArray(), []) ?? []

  useEffect(() => {
    if (existing) {
      setName(existing.name)
      setNotes(existing.notes ?? '')
      setRoutineExercises(existing.exercises)
    }
  }, [existing])

  function exerciseName(exerciseId: string) {
    return exercises.find((e) => e.id === exerciseId)?.name ?? '...'
  }

  function addExercise(exercise: Exercise) {
    setRoutineExercises((list) => [...list, { exerciseId: exercise.id, ...DEFAULT_TARGET }])
  }

  function removeExercise(exerciseId: string) {
    setRoutineExercises((list) => list.filter((re) => re.exerciseId !== exerciseId))
  }

  function updateExercise(exerciseId: string, patch: Partial<RoutineExercise>) {
    setRoutineExercises((list) =>
      list.map((re) => (re.exerciseId === exerciseId ? { ...re, ...patch } : re)),
    )
  }

  async function save() {
    if (!name.trim()) return
    const routine: Routine = {
      id: existing?.id ?? uuid(),
      name: name.trim(),
      exercises: routineExercises,
      notes: notes.trim() || undefined,
    }
    await db.routines.put(routine)
    navigate('/routines')
  }

  async function remove() {
    if (!existing) return
    await db.routines.delete(existing.id)
    navigate('/routines')
  }

  return (
    <div>
      <PageHeader title={isNew ? 'New Routine' : 'Edit Routine'} />
      <div className="space-y-4 p-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Routine name (e.g. Push Day)"
          className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
        />

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Routine notes or form cues"
          rows={3}
          className="w-full resize-y rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
        />

        <div className="space-y-3">
          {routineExercises.map((re) => (
            <div key={re.exerciseId} className="rounded-lg border border-neutral-800 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">{exerciseName(re.exerciseId)}</span>
                  {re.supersetGroup && (
                    <span className="ml-2 text-xs font-semibold text-orange-400">
                      SUPERSET {re.supersetGroup}{re.supersetOrder === 1 ? '1' : '2'}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => removeExercise(re.exerciseId)}
                  className="text-xs text-neutral-500"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <label className="flex-1 text-xs text-neutral-500">
                  Sets
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={re.targetSets}
                    onChange={(e) =>
                      updateExercise(re.exerciseId, { targetSets: Number(e.target.value) || 1 })
                    }
                    className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
                  />
                </label>
                <label className="flex-1 text-xs text-neutral-500">
                  Min reps
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={re.minReps}
                    onChange={(e) =>
                      updateExercise(re.exerciseId, { minReps: Number(e.target.value) || 1 })
                    }
                    className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
                  />
                </label>
                <label className="flex-1 text-xs text-neutral-500">
                  Max reps
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={re.maxReps}
                    onChange={(e) =>
                      updateExercise(re.exerciseId, { maxReps: Number(e.target.value) || 1 })
                    }
                    className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
                  />
                </label>
                <label className="flex-1 text-xs text-neutral-500">
                  Rest (s)
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={re.restSeconds ?? ''}
                    onChange={(e) =>
                      updateExercise(re.exerciseId, {
                        restSeconds: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
                  />
                </label>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs text-neutral-400">
                <input
                  type="checkbox"
                  checked={re.perSide ?? false}
                  onChange={(e) => updateExercise(re.exerciseId, { perSide: e.target.checked })}
                />
                Reps per side
              </label>
              {re.supersetGroup && re.supersetOrder === 1 && (
                <p className="mt-2 text-xs text-neutral-500">
                  Switch in about 10–20 seconds; rest 2 minutes after both exercises.
                </p>
              )}
            </div>
          ))}
        </div>

        <ExercisePicker
          onAdd={addExercise}
          excludeIds={routineExercises.map((re) => re.exerciseId)}
        />

        <div className="flex gap-2 pt-2">
          <button
            onClick={save}
            className="flex-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-neutral-950"
          >
            Save
          </button>
          {!isNew && (
            <button onClick={remove} className="rounded-lg border border-red-500/50 px-4 py-2 text-sm text-red-500">
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
