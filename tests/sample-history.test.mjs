import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { createSampleHistory } from '../src/sample-data.ts'
import { plateWeight } from '../src/weight.ts'

const routines = [
  ['built-in-lift-a', ['incline-db-press', 'pec-deck', 'cable-lateral-raise', 'rope-pressdown', 'cable-crunch', 'pallof-press']],
  ['built-in-lift-a2', ['machine-chest-press', 'cable-fly', 'cable-lateral-raise', 'rope-pressdown', 'cable-crunch', 'pallof-press']],
  ['built-in-lift-b', ['leg-press', 'hip-thrust-glute-drive-machine', 'leg-extension', 'leg-curl', '45-degree-back-extension', 'hanging-knee-captains-chair-raise']],
  ['built-in-lift-c', ['wide-grip-pulldown-pull-up', 'chest-supported-row', 'rear-delt-fly', 'cable-curl', 'weighted-machine-crunch', 'cable-wood-chop']],
  ['built-in-lift-c2', ['wide-grip-pulldown-pull-up', 'high-row', 'rear-delt-fly', 'cable-curl', 'weighted-machine-crunch', 'cable-wood-chop']],
].map(([id, exercises]) => ({
  id, name: id,
  exercises: exercises.map((exerciseId, index) => ({ exerciseId, targetSets: index === 4 ? 3 : 2, minReps: 8, maxReps: 15 })),
}))

test('creates eight weeks of marked, finished sessions with valid exercise targets and chart variation', () => {
  const sample = createSampleHistory(routines, new Date(2026, 10, 8, 12))
  assert.equal(sample.workouts.length, 24)
  assert.equal(sample.sets.length, 312)
  assert.equal(new Set(sample.workouts.map(workout => workout.id)).size, 24)
  assert.equal(new Set(sample.sets.map(set => set.id)).size, 312)
  const byWorkout = new Map(sample.workouts.map(workout => [workout.id, workout]))
  for (const workout of sample.workouts) {
    assert.equal(workout.isSample, true)
    assert.ok(workout.finishedAt)
    assert.ok(workout.date < '2026-11-08')
    assert.equal(workout.exerciseIds.length, 6)
  }
  for (const set of sample.sets) {
    const workout = byWorkout.get(set.workoutId)
    assert.ok(workout.exerciseIds.includes(set.exerciseId))
    const target = routines.find(routine => routine.id === workout.routineId).exercises.find(exercise => exercise.exerciseId === set.exerciseId)
    assert.ok(set.reps >= target.minReps && set.reps <= target.maxReps)
    assert.ok(set.order >= 0 && set.order < target.targetSets)
    if (set.plateLoading) assert.equal(plateWeight(set.plateLoading.platesPerSide, set.plateLoading.extraPerSide), set.weight)
  }
  const legPressWeights = sample.sets.filter(set => set.exerciseId === 'leg-press' && set.order === 0).map(set => set.weight)
  assert.ok(new Set(legPressWeights).size > 1)
  assert.ok(legPressWeights.at(-1) > legPressWeights[0])
})

test('skips routines that are unavailable rather than creating broken workout references', () => {
  const sample = createSampleHistory(routines.filter(routine => routine.id === 'built-in-lift-b'))
  assert.equal(sample.workouts.length, 8)
  assert.ok(sample.workouts.every(workout => workout.routineId === 'built-in-lift-b'))
  assert.deepEqual(createSampleHistory([]), { workouts: [], sets: [] })
})

test('sample lifecycle avoids duplicates, preserves real data, and stays removed after initialization', async () => {
  const realWorkout = { id: 'sample-history-v1-real-workout', name: 'Actual workout', finishedAt: '2026-11-08T12:00:00Z' }
  const realSet = { id: 'real-set', workoutId: realWorkout.id, weight: 50, reps: 10 }
  const workouts = new Map([[realWorkout.id, realWorkout]])
  const sets = new Map([[realSet.id, realSet]])
  const storage = new Map()
  const db = {
    routines: { toArray: async () => routines },
    workouts: {
      filter: predicate => ({
        count: async () => [...workouts.values()].filter(predicate).length,
        primaryKeys: async () => [...workouts.values()].filter(predicate).map(workout => workout.id),
      }),
      bulkAdd: async rows => rows.forEach(row => { assert.ok(!workouts.has(row.id)); workouts.set(row.id, row) }),
      bulkDelete: async ids => ids.forEach(id => workouts.delete(id)),
    },
    sets: {
      bulkAdd: async rows => rows.forEach(row => { assert.ok(!sets.has(row.id)); sets.set(row.id, row) }),
      where: field => {
        assert.equal(field, 'workoutId')
        return { anyOf: ids => ({ delete: async () => {
          for (const set of sets.values()) if (ids.includes(set.workoutId)) sets.delete(set.id)
        } }) }
      },
    },
    syncQueue: {},
    transaction: async (_mode, ...args) => args.at(-1)(),
  }
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/sample-history.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, {
    module, exports: module.exports,
    require: name => name === './db' ? { db } : { createSampleHistory },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  })
  const service = module.exports
  await service.initializeSampleHistory()
  assert.equal(workouts.size, 25)
  assert.equal(await service.addSampleHistory(), 0)
  assert.equal(workouts.size, 25)
  await service.removeSampleHistory()
  assert.deepEqual([...workouts.values()], [realWorkout])
  assert.deepEqual([...sets.values()], [realSet])
  await service.initializeSampleHistory()
  assert.equal(workouts.size, 1)
  assert.equal(await service.addSampleHistory(), 24)
  assert.equal(workouts.get(realWorkout.id), realWorkout)
})
