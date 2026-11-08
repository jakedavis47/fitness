import type { WorkoutSet } from './db'

export const PLATE_WEIGHT = 45

export function plateWeight(platesPerSide: number, extraPerSide: number): number | null {
  if (!Number.isInteger(platesPerSide) || platesPerSide < 0 || !Number.isFinite(extraPerSide) || extraPerSide < 0) {
    return null
  }
  const total = (platesPerSide * PLATE_WEIGHT + extraPerSide) * 2
  return Number.isFinite(total) ? total : null
}

export function formatWeight(set: Pick<WorkoutSet, 'weight' | 'plateLoading'>): string {
  if (set.plateLoading) {
    return `${set.plateLoading.platesPerSide} + ${set.plateLoading.extraPerSide} per side (${set.weight} lb)`
  }
  return `${set.weight} lb`
}
