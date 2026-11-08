import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import Dexie from 'dexie'
import ts from 'typescript'
import { installSyncOutbox } from '../src/sync-outbox.ts'

async function setup(t) {
  const db = new Dexie(`cloud-sync-test-${crypto.randomUUID()}`)
  db.version(1).stores({ exercises: 'id', sets: 'id, workoutId, exerciseId', workouts: 'id', routines: 'id', syncQueue: 'id, userId, queuedAt' })
  const remote = new Map()
  const storage = new Map()
  const navigator = { onLine: true }
  const state = { failUpload: false, beforeFetch: null, uploads: 0 }
  const client = {
    async rpc(name, { p_records: records }) {
      assert.equal(name, 'apply_user_records')
      if (state.failUpload) return { error: new Error('Network unavailable') }
      state.uploads++
      assert.ok(records.length <= 100)
      for (const row of records) {
        const key = `${row.collection}:${row.record_id}`
        const existing = remote.get(key)
        if (!existing || Date.parse(existing.updated_at) < Date.parse(row.updated_at)) remote.set(key, structuredClone(row))
      }
      return { error: null }
    },
    from() {
      const query = {
        select: () => query,
        eq: (_field, userId) => { assert.equal(userId, 'alice'); return query },
        order: () => query,
        async range(start, end) {
          if (state.beforeFetch) await state.beforeFetch()
          return { data: [...remote.values()].sort((a, b) => a.updated_at.localeCompare(b.updated_at)).slice(start, end + 1).map(row => structuredClone(row)), error: null }
        },
      }
      return query
    },
  }
  const window = new EventTarget()
  const module = { exports: {} }
  const source = fs.readFileSync(new URL('../src/sync.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '__env')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module, exports: module.exports,
    require: name => ({
      '@supabase/supabase-js': { createClient: () => client },
      './db': { db }, './sync-outbox': { installSyncOutbox },
    })[name],
    __env: { VITE_SUPABASE_URL: 'https://test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' },
    window, navigator, CustomEvent, console,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setTimeout: () => 1, clearTimeout: () => {},
  })
  await db.open()
  t.after(() => db.delete())
  return { db, remote, navigator, state, sync: module.exports }
}

test('first sign-in imports local data in batches and downloads cloud-only records', async t => {
  const { db, remote, state, sync } = await setup(t)
  await db.exercises.bulkAdd(Array.from({ length: 125 }, (_, index) => ({ id: `exercise-${index}`, name: `Exercise ${index}` })))
  remote.set('workouts:cloud-only', { collection: 'workouts', record_id: 'cloud-only', payload: { id: 'cloud-only', name: 'From phone' }, deleted: false, updated_at: '2026-01-01T00:00:00Z' })
  await sync.setActiveSyncUser({ id: 'alice' })
  assert.equal(remote.size, 126)
  assert.equal(state.uploads, 2)
  assert.equal((await db.workouts.get('cloud-only')).name, 'From phone')
  assert.equal(await db.syncQueue.count(), 0)
})

test('offline edits and edits made after signing out upload after the owner signs back in', async t => {
  const { db, remote, navigator, sync } = await setup(t)
  await sync.setActiveSyncUser({ id: 'alice' })
  navigator.onLine = false
  await db.sets.add({ id: 'set', workoutId: 'workout', exerciseId: 'exercise', weight: 100, reps: 10 })
  await sync.setActiveSyncUser(null)
  await db.sets.update('set', { weight: 110 })
  assert.equal(await db.syncQueue.count(), 2)
  navigator.onLine = true
  await sync.setActiveSyncUser({ id: 'alice' })
  assert.equal(remote.get('sets:set').payload.weight, 110)
  assert.equal(await db.syncQueue.count(), 0)
})

test('upload failure preserves the pending edit and succeeds on retry', async t => {
  const { db, remote, state, sync } = await setup(t)
  await sync.setActiveSyncUser({ id: 'alice' })
  await db.exercises.add({ id: 'exercise', name: 'Leg press' })
  state.failUpload = true
  await assert.rejects(sync.syncUserData('alice'), /Network unavailable/)
  assert.equal(await db.syncQueue.count(), 1)
  assert.equal((await db.exercises.get('exercise')).name, 'Leg press')
  state.failUpload = false
  await sync.syncUserData('alice')
  assert.equal(await db.syncQueue.count(), 0)
  assert.ok(remote.has('exercises:exercise'))
})

test('cloud tombstones remove local records and cannot be resurrected by initial import', async t => {
  const { db, remote, sync } = await setup(t)
  await db.routines.add({ id: 'deleted-routine', name: 'Old default' })
  remote.set('routines:deleted-routine', { collection: 'routines', record_id: 'deleted-routine', payload: null, deleted: true, updated_at: '2026-01-01T00:00:00Z' })
  await sync.setActiveSyncUser({ id: 'alice' })
  assert.equal(await db.routines.get('deleted-routine'), undefined)
  assert.equal(remote.get('routines:deleted-routine').deleted, true)
  assert.equal(await db.syncQueue.count(), 0)
})

test('edits made during download remain local until their next upload', async t => {
  const { db, remote, state, sync } = await setup(t)
  await db.exercises.add({ id: 'exercise', name: 'Original' })
  await sync.setActiveSyncUser({ id: 'alice' })
  let edited = false
  state.beforeFetch = async () => {
    if (edited) return
    edited = true
    await db.exercises.update('exercise', { name: 'Edited during sync' })
  }
  await sync.syncUserData('alice')
  assert.equal((await db.exercises.get('exercise')).name, 'Edited during sync')
  assert.equal(await db.syncQueue.count(), 1)
  state.beforeFetch = null
  await sync.syncUserData('alice')
  assert.equal(remote.get('exercises:exercise').payload.name, 'Edited during sync')
  assert.equal(await db.syncQueue.count(), 0)
})

test('switching accounts cannot upload this browser history to another owner', async t => {
  const { db, sync } = await setup(t)
  await sync.setActiveSyncUser({ id: 'alice' })
  await db.exercises.add({ id: 'exercise', name: 'Private workout exercise' })
  await assert.rejects(sync.setActiveSyncUser({ id: 'bob' }), /another account/)
  assert.equal((await db.syncQueue.toArray())[0].userId, 'alice')
  assert.equal((await db.exercises.get('exercise')).name, 'Private workout exercise')
})
