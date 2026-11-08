import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { v4 as uuid } from 'uuid'
import { db, type Exercise } from '../db'

export function useExercises() {
  return useLiveQuery(() => db.exercises.orderBy('name').toArray(), []) ?? []
}

/** Finds an exercise by name (case-insensitive) or creates a new one. */
export async function findOrCreateExercise(name: string): Promise<Exercise> {
  const trimmed = name.trim()
  const existing = await db.exercises
    .filter((e) => e.name.toLowerCase() === trimmed.toLowerCase())
    .first()
  if (existing) return existing
  const exercise: Exercise = { id: uuid(), name: trimmed }
  await db.exercises.add(exercise)
  return exercise
}

export default function ExercisePicker({
  onAdd,
  excludeIds = [],
}: {
  onAdd: (exercise: Exercise) => void
  excludeIds?: string[]
}) {
  const exercises = useExercises()
  const [value, setValue] = useState('')
  const available = exercises.filter((e) => !excludeIds.includes(e.id))

  async function handleAdd() {
    if (!value.trim()) return
    const exercise = await findOrCreateExercise(value)
    onAdd(exercise)
    setValue('')
  }

  return (
    <div className="flex gap-2">
      <input
        list="exercise-options"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleAdd()
          }
        }}
        placeholder="Exercise name (e.g. Bench Press)"
        className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
      />
      <datalist id="exercise-options">
        {available.map((e) => (
          <option key={e.id} value={e.name} />
        ))}
      </datalist>
      <button
        onClick={handleAdd}
        className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-neutral-950"
      >
        Add
      </button>
    </div>
  )
}
