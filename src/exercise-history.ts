import type { Workout, WorkoutSet } from './db'

export function findPreviousExerciseSession(
  exerciseId: string,
  currentWorkoutId: string,
  workouts: (Workout | undefined)[],
  sets: WorkoutSet[],
): { workout: Workout; sets: WorkoutSet[] } | null {
  const exerciseSets = sets.filter((set) => set.exerciseId === exerciseId && set.workoutId !== currentWorkoutId)
  const workoutIds = new Set(exerciseSets.map((set) => set.workoutId))
  const workout = workouts
    .filter((item): item is Workout => !!item?.finishedAt && item.id !== currentWorkoutId && workoutIds.has(item.id))
    .sort((a, b) => b.date.localeCompare(a.date) || b.finishedAt!.localeCompare(a.finishedAt!))[0]
  if (!workout) return null
  return {
    workout,
    sets: exerciseSets.filter((set) => set.workoutId === workout.id).sort((a, b) => a.order - b.order),
  }
}
