import Dexie, { type DBCoreTransaction } from 'dexie'
import type { SyncChange, SyncCollection } from './db'

const collections = new Set(['exercises', 'sets', 'workouts', 'routines'])

// Save the outbox in the same IndexedDB transaction as the edit. A failed or
// interrupted save can never leave a queued change without its matching record.
export function installSyncOutbox(
  database: Dexie,
  getUserId: () => string | null,
  onCommit: () => void,
  remoteTransactions = new WeakSet<DBCoreTransaction>(),
): void {
  let lastTimestamp = 0
  const scheduled = new WeakSet<DBCoreTransaction>()
  database.use({
    stack: 'dbcore',
    name: 'lift-log-outbox',
    level: 1,
    create(core) {
      return {
        ...core,
        transaction(stores, mode, options) {
          const needsOutbox = mode === 'readwrite' && stores.some((name) => collections.has(name))
          return core.transaction(needsOutbox ? [...new Set([...stores, 'syncQueue'])] : stores, mode, options)
        },
        table(name) {
          const table = core.table(name)
          if (!collections.has(name)) return table
          return {
            ...table,
            async mutate(request) {
              const userId = getUserId()
              const shouldQueue = userId && !remoteTransactions.has(request.trans)
              const keys = shouldQueue && request.type === 'deleteRange'
                ? (await table.query({ trans: request.trans, values: false, query: { index: table.schema.primaryKey, range: request.range } })).result
                : request.type === 'delete' ? request.keys : []
              const response = await table.mutate(request)
              if (!shouldQueue) return response

              const changes: SyncChange[] = []
              const values = request.type === 'add' || request.type === 'put' ? request.values : keys
              values.forEach((value, index) => {
                if (response.failures[index]) return
                lastTimestamp = Math.max(Date.now(), lastTimestamp + 1)
                const upsert = request.type === 'add' || request.type === 'put'
                changes.push({
                  id: crypto.randomUUID(),
                  userId,
                  collection: name as SyncCollection,
                  recordId: upsert ? String(value.id) : String(value),
                  action: upsert ? 'upsert' : 'delete',
                  ...(upsert ? { payload: value } : {}),
                  queuedAt: lastTimestamp,
                })
              })
              if (changes.length) {
                const queued = await core.table('syncQueue').mutate({ type: 'add', trans: request.trans, values: changes })
                if (queued.numFailures) {
                  request.trans.abort()
                  throw Object.values(queued.failures)[0]
                }
                if (!scheduled.has(request.trans)) {
                  scheduled.add(request.trans)
                  Dexie.currentTransaction?.on('complete', onCommit)
                }
              }
              return response
            },
          }
        },
      }
    },
  })
}
