import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import test from 'node:test'
import Dexie from 'dexie'
import { installSyncOutbox } from '../src/sync-outbox.ts'

async function database(t, userId = 'user-1') {
  const db = new Dexie(`sync-test-${crypto.randomUUID()}`)
  db.version(1).stores({
    exercises: 'id', sets: 'id, workoutId', workouts: 'id', routines: 'id', syncQueue: 'id, userId, queuedAt',
  })
  const remote = new WeakSet()
  let commits = 0
  installSyncOutbox(db, () => userId, () => { commits++ }, remote)
  await db.open()
  t.after(() => db.delete())
  return { db, remote, commits: () => commits }
}

test('single-table edits atomically save a complete outbox payload, including nested updates', async t => {
  const { db, commits } = await database(t)
  const routines = db.table('routines')
  await routines.add({ id: 'routine', name: 'Lift A', notes: 'Old note', exercises: [{ targetSets: 2 }] })
  await routines.update('routine', { notes: undefined, 'exercises.0.targetSets': 3 })
  const pending = await db.table('syncQueue').orderBy('queuedAt').toArray()
  assert.equal(pending.length, 2)
  assert.equal(pending[0].action, 'upsert')
  assert.equal(pending[1].payload.exercises[0].targetSets, 3)
  assert.equal('notes' in pending[1].payload, false)
  assert.equal(pending[1].payload.name, 'Lift A')
  assert.ok(pending[1].queuedAt > pending[0].queuedAt)
  assert.equal(commits(), 2)
})

test('an aborted workout transaction leaves neither data nor queued changes', async t => {
  const { db, commits } = await database(t)
  await assert.rejects(db.transaction('rw', db.table('workouts'), async () => {
    await db.table('workouts').add({ id: 'failed', name: 'Failed workout' })
    throw new Error('Abort this save')
  }))
  assert.equal(await db.table('workouts').count(), 0)
  assert.equal(await db.table('syncQueue').count(), 0)
  assert.equal(commits(), 0)
})

test('deleting sets and workouts, including range deletes, produces tombstones', async t => {
  const { db } = await database(t)
  await db.table('workouts').add({ id: 'workout' })
  await db.table('sets').bulkAdd([{ id: 'set-1', workoutId: 'workout' }, { id: 'set-2', workoutId: 'workout' }])
  await db.table('syncQueue').clear()
  await db.transaction('rw', db.table('workouts'), db.table('sets'), async () => {
    await db.table('sets').where('workoutId').equals('workout').delete()
    await db.table('workouts').delete('workout')
  })
  const pending = await db.table('syncQueue').toArray()
  assert.equal(pending.length, 3)
  assert.ok(pending.every(change => change.action === 'delete'))
  assert.deepEqual(pending.map(change => change.recordId).sort(), ['set-1', 'set-2', 'workout'])
  await db.table('syncQueue').clear()
  await db.table('exercises').bulkAdd([{ id: 'a' }, { id: 'b' }])
  await db.table('syncQueue').clear()
  await db.table('exercises').clear()
  assert.equal(await db.table('syncQueue').count(), 2)
})

test('applying cloud records does not requeue them or suppress concurrent local edits', async t => {
  const { db, remote } = await database(t)
  await Promise.all([
    db.transaction('rw', db.table('exercises'), async transaction => {
      remote.add(transaction.idbtrans)
      await db.table('exercises').put({ id: 'cloud', name: 'Cloud exercise' })
    }),
    db.table('exercises').put({ id: 'local', name: 'Local exercise' }),
  ])
  const pending = await db.table('syncQueue').toArray()
  assert.equal(pending.length, 1)
  assert.equal(pending[0].recordId, 'local')
  assert.equal(await db.table('exercises').count(), 2)
})

test('unauthenticated first-time use works without queued cloud changes', async t => {
  const { db } = await database(t, null)
  await db.table('workouts').add({ id: 'local-only' })
  assert.equal(await db.table('workouts').count(), 1)
  assert.equal(await db.table('syncQueue').count(), 0)
})
