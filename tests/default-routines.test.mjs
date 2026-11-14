import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import Dexie from 'dexie'
import ts from 'typescript'

async function setup(t) {
  const storage = new Map()
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/db.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, {
    module, exports: module.exports,
    require: () => Dexie,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  })
  t.after(() => module.exports.db.delete())
  return module.exports
}

test('every fresh browser gets all five program routines and exercise definitions without sign-in', async t => {
  const { db, ensureDefaultRoutines } = await setup(t)
  await ensureDefaultRoutines()
  const routines = await db.routines.toArray()
  assert.deepEqual(routines.map(routine => routine.id).sort(), [
    'built-in-lift-a', 'built-in-lift-a2', 'built-in-lift-b', 'built-in-lift-c', 'built-in-lift-c2',
  ])
  for (const routine of routines) {
    assert.equal(routine.exercises.length, 6)
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
  await db.routines.delete('built-in-lift-b')
  await db.routines.add({ id: 'personal', name: 'My routine', exercises: [] })
  await ensureDefaultRoutines()
  assert.equal((await db.routines.get('built-in-lift-a')).name, 'My Lift A')
  assert.equal(await db.routines.get('built-in-lift-b'), undefined)
  assert.equal((await db.routines.get('personal')).name, 'My routine')
})
