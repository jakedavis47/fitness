import assert from 'node:assert/strict'
import test from 'node:test'
import { findPreviousExerciseSession } from '../src/exercise-history.ts'

const workout = (id, date, finishedAt = `${date}T18:00:00Z`) => ({ id, date, name: id, finishedAt, exerciseIds: ['row'] })
const set = (id, workoutId, weight, reps, order = 0, exerciseId = 'row') => ({ id, workoutId, exerciseId, weight, reps, order })

test('shows every set from the latest session rather than the heaviest historical set', () => {
  const workouts = [workout('old', '2026-10-25'), workout('latest', '2026-11-01')]
  const sets = [set('old-best', 'old', 200, 6), set('second', 'latest', 150, 8, 1), set('first', 'latest', 150, 10)]
  const result = findPreviousExerciseSession('row', 'current', workouts, sets)
  assert.equal(result.workout.id, 'latest')
  assert.deepEqual(result.sets.map(set => [set.weight, set.reps]), [[150, 10], [150, 8]])
  assert.equal(sets[1].id, 'second', 'Lookup must not reorder the input data')
})

test('excludes current workouts, unfinished workouts, missing records, and other exercises', () => {
  const workouts = [
    workout('previous', '2026-11-01'), workout('current', '2026-11-08'),
    { ...workout('unfinished', '2026-11-07'), finishedAt: undefined },
    workout('other-exercise', '2026-11-06'), undefined,
  ]
  const sets = [
    set('previous', 'previous', 90, 10), set('current', 'current', 180, 10),
    set('unfinished', 'unfinished', 180, 10), set('orphan', 'missing', 180, 10),
    set('curl', 'other-exercise', 30, 12, 0, 'curl'),
  ]
  assert.equal(findPreviousExerciseSession('row', 'current', workouts, sets).workout.id, 'previous')
})

test('uses the most recently finished workout when two sessions share a date', () => {
  const workouts = [workout('morning', '2026-11-01', '2026-11-01T10:00:00Z'), workout('evening', '2026-11-01', '2026-11-01T20:00:00Z')]
  const sets = [set('am', 'morning', 100, 10), set('pm', 'evening', 105, 10)]
  assert.equal(findPreviousExerciseSession('row', 'current', workouts, sets).workout.id, 'evening')
})

test('retains plate notation and bodyweight sets for the previous session', () => {
  const workouts = [workout('previous', '2026-11-01')]
  const sets = [
    { ...set('plates', 'previous', 300, 10), plateLoading: { platesPerSide: 3, extraPerSide: 15 } },
    set('bodyweight', 'previous', 0, 12, 1),
  ]
  assert.deepEqual(findPreviousExerciseSession('row', 'current', workouts, sets).sets, sets)
})

test('returns no previous session when there are no completed sets', () => {
  assert.equal(findPreviousExerciseSession('row', 'current', [], []), null)
  assert.equal(findPreviousExerciseSession('row', 'current', [workout('empty', '2026-11-01')], []), null)
})
