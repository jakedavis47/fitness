import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import Dexie from 'dexie'
import ts from 'typescript'
import { findPreviousExerciseSession } from '../src/exercise-history.ts'
import { installSyncOutbox } from '../src/sync-outbox.ts'

async function setup(t, userId = null) {
  const storage = new Map()
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/db.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, {
    module, exports: module.exports,
    require: () => Dexie,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  })
  if (userId) installSyncOutbox(module.exports.db, () => userId, () => {})
  t.after(() => module.exports.db.delete())
  return { ...module.exports, storage }
}

test('every fresh browser gets all eight program routines and exercise definitions without sign-in', async t => {
  const { db, ensureDefaultRoutines } = await setup(t)
  await ensureDefaultRoutines()
  const routines = await db.routines.toArray()
  assert.deepEqual(routines.map(routine => routine.id).sort(), [
    'built-in-hypertrophy-full-body', 'built-in-hypertrophy-lower', 'built-in-hypertrophy-upper',
    'built-in-lift-a', 'built-in-lift-a2', 'built-in-lift-b', 'built-in-lift-c', 'built-in-lift-c2',
  ])
  for (const routine of routines) {
    if (routine.id.startsWith('built-in-lift-')) assert.equal(routine.exercises.length, 6)
    for (const target of routine.exercises) {
      assert.ok(await db.exercises.get(target.exerciseId), `${routine.name}: ${target.exerciseId}`)
      assert.ok(target.targetSets > 0)
      assert.ok(target.minReps > 0 && target.maxReps >= target.minReps)
    }
  }
  assert.equal(await db.workouts.count(), 0)
  assert.equal(await db.sets.count(), 0)
  assert.equal(await db.syncQueue.count(), 0)
})

test('repeat startup preserves personal changes, deleted defaults, and custom routines', async t => {
  const { db, ensureDefaultRoutines } = await setup(t)
  await ensureDefaultRoutines()
  await db.routines.update('built-in-lift-a', { name: 'My Lift A' })
  await db.routines.update('built-in-hypertrophy-upper', { name: 'My Upper Body' })
  await db.routines.delete('built-in-lift-b')
  await db.routines.delete('built-in-hypertrophy-lower')
  await db.routines.add({ id: 'personal', name: 'My routine', exercises: [] })
  await ensureDefaultRoutines()
  assert.equal((await db.routines.get('built-in-lift-a')).name, 'My Lift A')
  assert.equal(await db.routines.get('built-in-lift-b'), undefined)
  assert.equal((await db.routines.get('built-in-hypertrophy-upper')).name, 'My Upper Body')
  assert.equal(await db.routines.get('built-in-hypertrophy-lower'), undefined)
  assert.equal((await db.routines.get('personal')).name, 'My routine')
})

test('hypertrophy routines match the supplied order and targets using existing lift identities', async t => {
  const { db, ensureDefaultRoutines } = await setup(t)
  await ensureDefaultRoutines()
  const expected = [
    ['upper', 'Hypertrophy 1 — Upper Body', 18, [
      ['incline-db-press', 3, 6, 10, false],
      ['chest-supported-row', 3, 8, 12, false],
      ['leg-press', 2, 8, 12, false],
      ['leg-curl', 2, 10, 15, false],
      ['cable-lateral-raise', 3, 12, 20, false],
      ['rope-pressdown', 2, 10, 15, false],
      ['weighted-machine-crunch', 3, 8, 15, false],
    ]],
    ['lower', 'Hypertrophy 2 — Lower Body', 18, [
      ['leg-press', 3, 8, 12, false],
      ['hip-thrust-glute-drive-machine', 3, 8, 12, false],
      ['wide-grip-pulldown-pull-up', 3, 6, 10, false],
      ['machine-chest-press', 2, 8, 12, false],
      ['leg-curl', 2, 10, 15, false],
      ['cable-curl', 2, 10, 15, false],
      ['hanging-knee-captains-chair-raise', 3, 8, 15, false],
    ]],
    ['full-body', 'Hypertrophy 3 — Full Body / Back', 21, [
      ['machine-chest-press', 3, 8, 12, false],
      ['chest-supported-row', 3, 8, 12, false],
      ['leg-extension', 3, 10, 15, false],
      ['leg-curl', 2, 10, 15, false],
      ['cable-lateral-raise', 3, 12, 20, false],
      ['rear-delt-fly', 3, 12, 20, false],
      ['rope-pressdown', 2, 10, 15, false],
      ['pallof-press', 2, 10, 15, true],
    ]],
  ]
  const originalExerciseIds = new Set((await db.routines.toArray())
    .filter(routine => routine.id.startsWith('built-in-lift-'))
    .flatMap(routine => routine.exercises.map(target => target.exerciseId)))
  for (const [suffix, name, total, targets] of expected) {
    const routine = await db.routines.get(`built-in-hypertrophy-${suffix}`)
    assert.equal(routine.name, name)
    assert.equal(routine.exercises.reduce((sum, target) => sum + target.targetSets, 0), total)
    assert.deepEqual(routine.exercises.map(target => [
      target.exerciseId, target.targetSets, target.minReps, target.maxReps, target.perSide ?? false,
    ]), targets)
    assert.ok(routine.notes.includes('60–75 minutes'))
    for (const target of routine.exercises) {
      assert.ok(originalExerciseIds.has(target.exerciseId), `New identity for ${target.exerciseId}`)
      assert.ok(target.restSeconds > 0)
    }
  }
})

test('existing users receive the new program without changing saved routines, exercises, or history', async t => {
  const { db, ensureDefaultRoutines, storage } = await setup(t, 'existing-user')
  storage.set('lift-log-default-routines-seeded-v1', 'true')
  await db.routines.bulkAdd([
    { id: 'built-in-lift-a', name: 'My Lift A', exercises: [{ exerciseId: 'incline-db-press', targetSets: 4 }] },
    { id: 'personal', name: 'My routine', exercises: [] },
  ])
  await db.exercises.add({ id: 'incline-db-press', name: 'My incline press', weightInputMode: 'plates' })
  const workout = { id: 'previous', name: 'Lift A', date: '2026-11-22', finishedAt: '2026-11-22T18:00:00Z', exerciseIds: ['incline-db-press'] }
  const set = { id: 'previous-set', workoutId: workout.id, exerciseId: 'incline-db-press', weight: 50, reps: 8, order: 0 }
  await db.workouts.add(workout)
  await db.sets.add(set)
  const savedRoutines = await db.routines.toArray()
  // Startup changes for an existing owner enter the same outbox as normal edits.
  await db.syncQueue.clear()
  await ensureDefaultRoutines()
  assert.equal(await db.routines.count(), 5)
  for (const routine of savedRoutines) assert.deepEqual(await db.routines.get(routine.id), routine)
  assert.equal(await db.routines.get('built-in-lift-b'), undefined, 'Do not restore deleted original defaults')
  assert.deepEqual(await db.exercises.get('incline-db-press'), { id: 'incline-db-press', name: 'My incline press', weightInputMode: 'plates' })
  assert.deepEqual(await db.workouts.toArray(), [workout])
  assert.deepEqual(await db.sets.toArray(), [set])
  const upper = await db.routines.get('built-in-hypertrophy-upper')
  const previous = findPreviousExerciseSession(upper.exercises[0].exerciseId, 'new-workout', await db.workouts.toArray(), await db.sets.toArray())
  assert.deepEqual(previous, { workout, sets: [set] })
  const queued = await db.syncQueue.toArray()
  assert.equal(queued.filter(change => change.collection === 'routines').length, 3)
  assert.ok(queued.every(change => change.userId === 'existing-user' && change.action === 'upsert'))
  assert.ok(queued.every(change => change.collection === 'routines' || change.collection === 'exercises'))
  const queueSize = queued.length
  await ensureDefaultRoutines()
  assert.equal(await db.syncQueue.count(), queueSize)
})

test('a fresh browser preserves customized program copies already present locally', async t => {
  const { db, ensureDefaultRoutines } = await setup(t)
  const custom = { id: 'built-in-hypertrophy-upper', name: 'Custom Upper', exercises: [], notes: 'Personal targets' }
  await db.routines.add(custom)
  await ensureDefaultRoutines()
  assert.deepEqual(await db.routines.get(custom.id), custom)
  assert.equal(await db.routines.count(), 8)
})
