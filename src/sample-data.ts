import type { Routine, Workout, WorkoutSet } from './db'

const startingWeights: Record<string, number> = {
  'incline-db-press': 35,
  'pec-deck': 75,
  'machine-chest-press': 90,
  'cable-fly': 20,
  'cable-lateral-raise': 10,
  'rope-pressdown': 40,
  'cable-crunch': 60,
  'pallof-press': 20,
  'leg-press': 270,
  'hip-thrust-glute-drive-machine': 180,
  'leg-extension': 70,
  'leg-curl': 60,
  '45-degree-back-extension': 10,
  'hanging-knee-captains-chair-raise': 0,
  'wide-grip-pulldown-pull-up': 0,
  'chest-supported-row': 90,
  'high-row': 90,
  'rear-delt-fly': 40,
  'cable-curl': 25,
  'weighted-machine-crunch': 70,
  'cable-wood-chop': 25,
}

export function createSampleHistory(routines: Routine[], today = new Date()): { workouts: Workout[]; sets: WorkoutSet[] } {
  const byId = new Map(routines.map((routine) => [routine.id, routine]))
  const workouts: Workout[] = []
  const sets: WorkoutSet[] = []

  for (let week = 0; week < 8; week++) {
    const routineIds = [
      week % 2 === 0 ? 'built-in-lift-a' : 'built-in-lift-a2',
      'built-in-lift-b',
      week % 2 === 0 ? 'built-in-lift-c' : 'built-in-lift-c2',
    ]
    for (const [session, routineId] of routineIds.entries()) {
      const routine = byId.get(routineId)
      if (!routine) continue
      const day = new Date(today)
      day.setHours(12, 0, 0, 0)
      day.setDate(day.getDate() - ((7 - week) * 7 + (2 - session) * 2 + 1))
      const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
      const workoutId = `sample-history-v1-${routineId}-${week}`
      workouts.push({
        id: workoutId,
        name: routine.name,
        date,
        routineId,
        exerciseIds: routine.exercises.map((exercise) => exercise.exerciseId),
        finishedAt: day.toISOString(),
        isSample: true,
        notes: 'Synthetic workout for previewing progress.',
      })

      for (const target of routine.exercises) {
        const baseWeight = startingWeights[target.exerciseId] ?? 30
        const step = Math.floor(week / 2)
        const weight = baseWeight === 0 ? 0 : baseWeight + step * (baseWeight >= 90 ? 10 : 5)
        for (let order = 0; order < target.targetSets; order++) {
          const reps = Math.max(target.minReps, Math.min(target.maxReps,
            target.minReps + 1 + week % 2 * 2 - order - (week === 4 ? 1 : 0)))
          const usesPlates = target.exerciseId === 'leg-press' || target.exerciseId === 'hip-thrust-glute-drive-machine'
          const platesPerSide = Math.floor(weight / 2 / 45)
          sets.push({
            id: `${workoutId}-${target.exerciseId}-${order}`,
            workoutId,
            exerciseId: target.exerciseId,
            order,
            weight,
            reps,
            ...(usesPlates ? { plateLoading: { platesPerSide, extraPerSide: weight / 2 - platesPerSide * 45 } } : {}),
          })
        }
      }
    }
  }
  return { workouts, sets }
}
