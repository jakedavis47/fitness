import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { v4 as uuid } from 'uuid'
import { db, type RoutineExercise, type WorkoutSet } from '../db'
import PageHeader from '../components/PageHeader'
import ExercisePicker from '../components/ExercisePicker'
import { formatWeight, plateWeight, PLATE_WEIGHT } from '../weight'
import { findPreviousExerciseSession } from '../exercise-history'

function ExerciseSection({
  exerciseId,
  workoutId,
  target,
  onRemove,
}: {
  exerciseId: string
  workoutId: string
  target?: RoutineExercise
  onRemove: () => void
}) {
  const [weight, setWeight] = useState('')
  const [plates, setPlates] = useState('')
  const [extra, setExtra] = useState('')
  const [reps, setReps] = useState('')
  const [error, setError] = useState('')

  const exercise = useLiveQuery(() => db.exercises.get(exerciseId), [exerciseId])
  const usesPlates = exercise?.weightInputMode === 'plates'
  const plateTotal = plateWeight(Number(plates), Number(extra))
  const sets =
    useLiveQuery(
      () =>
        db.sets.where({ workoutId, exerciseId }).sortBy('order'),
      [workoutId, exerciseId],
    ) ?? []
  const previousSession = useLiveQuery(async () => {
    const prior = await db.sets.where('exerciseId').equals(exerciseId).toArray()
    const workoutIds = [...new Set(prior.filter((set) => set.workoutId !== workoutId).map((set) => set.workoutId))]
    const workouts = await db.workouts.bulkGet(workoutIds)
    return findPreviousExerciseSession(exerciseId, workoutId, workouts, prior)
  }, [exerciseId, workoutId])

  async function changeWeightMode(usePlates: boolean) {
    if (!exercise || usePlates === usesPlates) return
    setError('')
    if (usePlates && weight !== '') {
      const total = Number(weight)
      if (Number.isFinite(total) && total >= 0) {
        const count = Math.floor(total / 2 / PLATE_WEIGHT)
        setPlates(String(count))
        setExtra(String(total / 2 - count * PLATE_WEIGHT))
      }
    } else if (!usePlates && (plates !== '' || extra !== '') && plateTotal !== null) {
      setWeight(String(plateTotal))
    }
    try {
      await db.exercises.update(exerciseId, { weightInputMode: usePlates ? 'plates' : 'weight' })
    } catch {
      setError('Could not save the weight entry preference. Please try again.')
    }
  }

  async function addSet() {
    const w = usesPlates ? plateTotal : Number(weight)
    const r = Number(reps)
    if (w === null || !Number.isFinite(w) || w < 0 || !Number.isInteger(r) || r <= 0) {
      setError(usesPlates
        ? 'Enter a whole number of plates, non-negative extra weight, and a positive whole number of reps.'
        : 'Enter a non-negative weight and a positive whole number of reps.')
      return
    }
    const set: WorkoutSet = {
      id: uuid(),
      workoutId,
      exerciseId,
      order: sets.length,
      weight: w,
      reps: r,
      ...(usesPlates ? { plateLoading: { platesPerSide: Number(plates), extraPerSide: Number(extra) } } : {}),
    }
    try {
      await db.sets.add(set)
      setWeight('')
      setPlates('')
      setExtra('')
      setReps('')
      setError('')
    } catch {
      setError('Could not save this set. Please try again.')
    }
  }

  async function removeSet(id: string) {
    await db.sets.delete(id)
  }

  return (
    <div className="rounded-xl border border-neutral-800 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold">{exercise?.name ?? '...'}</h3>
        <button onClick={onRemove} className="text-xs text-neutral-500">
          Remove
        </button>
      </div>

      {target && (
        <p className="mb-2 text-xs text-orange-400">
          Target: {target.targetSets} × {target.minReps}
          {target.maxReps !== target.minReps ? `–${target.maxReps}` : ''} reps
          {target.perSide ? ' per side' : ''}
          {sets.length > 0 ? ` (${sets.length}/${target.targetSets} done)` : ''}
        </p>
      )}

      {target?.restSeconds !== undefined && !target.supersetGroup && (
        <p className="mb-2 text-xs text-neutral-500">
          Rest {Math.floor(target.restSeconds / 60)} min
          {target.restSeconds % 60 ? ` ${target.restSeconds % 60}s` : ''} between sets
        </p>
      )}

      {previousSession && (
        <section aria-label="Previous workout for this exercise" className="mb-3 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <h4 className="font-medium text-neutral-300">Last time</h4>
            <time dateTime={previousSession.workout.date} className="text-neutral-500">{previousSession.workout.date}</time>
          </div>
          <p className="mb-2 text-xs text-neutral-500">
            {previousSession.workout.name}{previousSession.workout.isSample ? ' · Sample' : ''}
          </p>
          <ol className="space-y-1.5">
            {previousSession.sets.map((set, index) => (
              <li key={set.id} className="flex justify-between gap-3 text-xs">
                <span className="shrink-0 text-neutral-500">Set {index + 1}</span>
                <span className="text-right tabular-nums text-neutral-300">
                  {formatWeight(set)} × {set.reps} reps{target?.perSide ? ' / side' : ''}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {previousSession === null && (
        <p className="mb-3 text-xs text-neutral-500">No previous completed sets for this exercise.</p>
      )}

      {sets.length > 0 && (
        <ul className="mb-2 space-y-1">
          {sets.map((s, i) => (
            <li key={s.id} className="flex items-center justify-between text-sm">
              <span>
                Set {i + 1}: {formatWeight(s)} × {s.reps}
              </span>
              <button onClick={() => removeSet(s.id)} className="text-xs text-neutral-500">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div role="group" aria-label="Weight entry mode" className="mb-3 flex gap-2">
        {[{ plates: false, label: 'Total lb' }, { plates: true, label: 'Plates + extra' }].map((mode) => (
          <button
            key={mode.label}
            type="button"
            aria-pressed={usesPlates === mode.plates}
            disabled={!exercise}
            onClick={() => void changeWeightMode(mode.plates)}
            className={`rounded-lg border px-3 py-1.5 text-xs ${usesPlates === mode.plates
              ? 'border-orange-500 bg-orange-500/10 text-orange-400'
              : 'border-neutral-700 text-neutral-400'}`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {usesPlates && (
        <div className="mb-3 space-y-2">
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1 text-xs text-neutral-400">
              45-lb plates per side
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={plates}
                onChange={(e) => setPlates(e.target.value)}
                placeholder="e.g. 3"
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm"
              />
            </label>
            <span aria-hidden="true" className="pb-2 text-neutral-500">+</span>
            <label className="min-w-0 flex-1 text-xs text-neutral-400">
              Extra lb per side
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                placeholder="e.g. 15"
                className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm"
              />
            </label>
          </div>
          <p role="status" className="text-xs text-neutral-500">
            {plateTotal === null ? 'Use whole plates and non-negative extra weight.' : `${plateTotal} lb total across both sides.`}
            {' '}Excludes machine starting resistance.
          </p>
        </div>
      )}

      <div className="flex gap-2">
        {!usesPlates && <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="Weight (or 0)"
          aria-label="Total weight in pounds"
          className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm"
        />}
        <input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          placeholder={target?.perSide ? 'Reps / side' : 'Reps'}
          aria-label={target?.perSide ? 'Reps per side' : 'Reps'}
          className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm"
        />
        <button
          onClick={addSet}
          className="flex-1 rounded-lg bg-neutral-800 px-2 py-2 text-sm font-medium"
        >
          Add Set
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  )
}

export default function ActiveWorkout() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const workout = useLiveQuery(() => db.workouts.get(id!), [id])
  const routine = useLiveQuery(
    () => (workout?.routineId ? db.routines.get(workout.routineId) : undefined),
    [workout?.routineId],
  )

  if (!workout) return null

  async function addExercise(exerciseId: string) {
    if (workout!.exerciseIds.includes(exerciseId)) return
    await db.workouts.update(workout!.id, {
      exerciseIds: [...workout!.exerciseIds, exerciseId],
    })
  }

  async function removeExercise(exerciseId: string) {
    await db.sets.where({ workoutId: workout!.id, exerciseId }).delete()
    await db.workouts.update(workout!.id, {
      exerciseIds: workout!.exerciseIds.filter((eid) => eid !== exerciseId),
    })
  }

  async function finishWorkout() {
    await db.workouts.update(workout!.id, { finishedAt: new Date().toISOString() })
    navigate(`/history/${workout!.id}`)
  }

  async function discardWorkout() {
    await db.sets.where({ workoutId: workout!.id }).delete()
    await db.workouts.delete(workout!.id)
    navigate('/')
  }

  function renderExercise(exerciseId: string, index: number) {
    const activeWorkout = workout!
    const activeRoutine = routine
    const target = activeRoutine?.exercises.find((item) => item.exerciseId === exerciseId)
    if (!target?.supersetGroup || !activeRoutine) {
      return (
        <ExerciseSection
          key={exerciseId}
          exerciseId={exerciseId}
          workoutId={activeWorkout.id}
          target={target}
          onRemove={() => removeExercise(exerciseId)}
        />
      )
    }

    const priorHasGroup = activeWorkout.exerciseIds
      .slice(0, index)
      .some((id) => activeRoutine.exercises.find((item) => item.exerciseId === id)?.supersetGroup === target.supersetGroup)
    if (priorHasGroup) return null

    const groupExerciseIds = activeWorkout.exerciseIds.filter(
      (id) => activeRoutine.exercises.find((item) => item.exerciseId === id)?.supersetGroup === target.supersetGroup,
    )
    return (
      <section key={`superset-${target.supersetGroup}`} className="space-y-2 border-l-2 border-orange-500 pl-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase text-orange-400">Superset {target.supersetGroup}</h3>
          <span className="text-xs text-neutral-500">Switch 10–20s · Rest 2 min after both</span>
        </div>
        {groupExerciseIds.map((groupExerciseId) => (
          <ExerciseSection
            key={groupExerciseId}
            exerciseId={groupExerciseId}
            workoutId={activeWorkout.id}
            target={activeRoutine.exercises.find((item) => item.exerciseId === groupExerciseId)}
            onRemove={() => removeExercise(groupExerciseId)}
          />
        ))}
      </section>
    )
  }

  return (
    <div>
      <PageHeader
        title={workout.name}
        action={
          <button
            onClick={finishWorkout}
            className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-neutral-950"
          >
            Finish
          </button>
        }
      />
      <div className="space-y-3 p-4">
        {routine?.notes && (
          <aside className="border-l-2 border-sky-500 px-3 py-2 text-sm text-neutral-300">
            {routine.notes}
          </aside>
        )}
        {workout.exerciseIds.map(renderExercise)}

        <div className="rounded-xl border border-dashed border-neutral-700 p-3">
          <ExercisePicker
            onAdd={(exercise) => addExercise(exercise.id)}
            excludeIds={workout.exerciseIds}
          />
        </div>

        <button onClick={discardWorkout} className="w-full py-3 text-sm text-red-500">
          Discard Workout
        </button>
      </div>
    </div>
  )
}
