import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import type { DBCoreTransaction } from 'dexie'
import { db, type Exercise, type Routine, type SyncCollection, type Workout, type WorkoutSet } from './db'
import { installSyncOutbox } from './sync-outbox'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

export const cloudConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

let activeUserId: string | null = null
const remoteTransactions = new WeakSet<DBCoreTransaction>()
const ownerKey = 'lift-log-local-data-owner'
let syncTimer: ReturnType<typeof setTimeout> | undefined
let syncInProgress: Promise<void> | undefined

function publishSyncStatus(status: 'syncing' | 'synced' | 'error', message?: string): void {
  window.dispatchEvent(new CustomEvent('lift-log-sync', { detail: { status, message } }))
}

const tables = {
  exercises: db.exercises,
  sets: db.sets,
  workouts: db.workouts,
  routines: db.routines,
}

installSyncOutbox(db, () => activeUserId ?? localStorage.getItem(ownerKey), scheduleSync, remoteTransactions)

function scheduleSync(): void {
  if (!activeUserId || !supabase) return
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    if (activeUserId) void syncUserData(activeUserId).catch(console.error)
  }, 700)
}

interface CloudChange {
  collection: SyncCollection,
  record_id: string,
  payload: Exercise | WorkoutSet | Workout | Routine | null,
  deleted: boolean,
  updated_at: string,
}

async function upsertCloudRecords(userId: string, records: CloudChange[]): Promise<void> {
  if (!supabase) return
  for (let offset = 0; offset < records.length; offset += 100) {
    if (activeUserId !== userId) throw new Error('Your sign-in changed. Please sync again.')
    const { error } = await supabase.rpc('apply_user_records', { p_records: records.slice(offset, offset + 100) })
    if (error) throw error
  }
}

async function fetchAllCloudRecords(userId: string) {
  if (!supabase) return []
  const rows: Array<{
    collection: SyncCollection
    record_id: string
    payload: Exercise | WorkoutSet | Workout | Routine | null
    deleted: boolean
    updated_at: string
  }> = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from('user_records')
      .select('collection, record_id, payload, deleted, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: true })
      .order('collection', { ascending: true })
      .order('record_id', { ascending: true })
      .range(offset, offset + 499)
    if (error) throw error
    rows.push(...data)
    if (data.length < 500) return rows
  }
}

async function uploadPending(userId: string): Promise<void> {
  const pending = await db.syncQueue.where('userId').equals(userId).sortBy('queuedAt')
  await upsertCloudRecords(userId, pending.map((change) => ({
    collection: change.collection,
    record_id: change.recordId,
    payload: change.action === 'delete' ? null : (change.payload ?? null),
    deleted: change.action === 'delete',
    updated_at: new Date(change.queuedAt).toISOString(),
  })))
  await db.syncQueue.bulkDelete(pending.map((change) => change.id))
}

async function uploadLocalRecordsMissingFromCloud(userId: string, remoteIds: Set<string>): Promise<void> {
  const missing: CloudChange[] = []
  for (const collection of Object.keys(tables) as SyncCollection[]) {
    const localRecords = await tables[collection].toArray()
    for (const record of localRecords) {
      const id = `${collection}:${record.id}`
      if (!remoteIds.has(id)) {
        missing.push({ collection, record_id: record.id, payload: record, deleted: false, updated_at: new Date().toISOString() })
      }
    }
  }
  await upsertCloudRecords(userId, missing)
}

async function applyCloudRecords(
  userId: string,
  records: Awaited<ReturnType<typeof fetchAllCloudRecords>>,
): Promise<void> {
  await db.transaction('rw', db.exercises, db.sets, db.workouts, db.routines, db.syncQueue, async (transaction) => {
    if (activeUserId !== userId) throw new Error('Your sign-in changed. Please sync again.')
    remoteTransactions.add(transaction.idbtrans)
    const pending = await db.syncQueue.where('userId').equals(userId).toArray()
    const pendingIds = new Set(pending.map((change) => `${change.collection}:${change.recordId}`))
    for (const row of records) {
      if (pendingIds.has(`${row.collection}:${row.record_id}`)) continue
      const table = tables[row.collection]
      if (row.deleted) {
        await table.delete(row.record_id)
      } else if (row.payload) {
        await table.put(row.payload as never)
      }
    }
  })
}

export async function syncUserData(userId: string): Promise<void> {
  if (!supabase || !navigator.onLine) throw new Error('Cloud sync needs an internet connection.')
  if (activeUserId !== userId) throw new Error('Please sign in before syncing.')
  if (syncInProgress) return syncInProgress

  syncInProgress = (async () => {
    publishSyncStatus('syncing')
    try {
      await uploadPending(userId)
      const initialRecords = await fetchAllCloudRecords(userId)
      const knownIds = new Set(initialRecords.map((row) => `${row.collection}:${row.record_id}`))
      await uploadLocalRecordsMissingFromCloud(userId, knownIds)
      const latestRecords = await fetchAllCloudRecords(userId)
      await applyCloudRecords(userId, latestRecords)
      if (await db.syncQueue.where('userId').equals(userId).count()) scheduleSync()
      else publishSyncStatus('synced')
    } catch (error) {
      publishSyncStatus('error', error instanceof Error ? error.message : 'Cloud sync failed.')
      throw error
    }
  })()

  try {
    await syncInProgress
  } finally {
    syncInProgress = undefined
  }
}

export async function setActiveSyncUser(user: User | null): Promise<void> {
  const existingOwner = localStorage.getItem(ownerKey)
  if (user && existingOwner && existingOwner !== user.id) {
    activeUserId = null
    throw new Error('This browser already contains workout data linked to another account. Use that account here, or export/clear this browser before switching accounts.')
  }
  if (user && !existingOwner) localStorage.setItem(ownerKey, user.id)
  activeUserId = user?.id ?? null
  if (activeUserId && navigator.onLine) await syncUserData(activeUserId)
}

export function setupNetworkSync(): () => void {
  const handleOnline = () => scheduleSync()
  const handleVisible = () => {
    if (document.visibilityState === 'visible') scheduleSync()
  }
  const interval = window.setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) scheduleSync()
  }, 30_000)
  window.addEventListener('online', handleOnline)
  window.addEventListener('focus', handleOnline)
  document.addEventListener('visibilitychange', handleVisible)
  return () => {
    clearInterval(interval)
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('focus', handleOnline)
    document.removeEventListener('visibilitychange', handleVisible)
  }
}

export function startCloudSync(): () => void {
  const stopNetworkSync = setupNetworkSync()
  if (!supabase) return stopNetworkSync
  let revision = 0
  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
    const nextRevision = ++revision
    if (!session) {
      activeUserId = null
      clearTimeout(syncTimer)
    }
    // Defer Supabase calls until the auth callback has released its lock.
    window.setTimeout(() => {
      if (nextRevision !== revision) return
      void setActiveSyncUser(session?.user ?? null).catch((error: unknown) => {
        publishSyncStatus('error', error instanceof Error ? error.message : 'Cloud sync failed.')
      })
    }, 0)
  })
  return () => {
    revision++
    listener.subscription.unsubscribe()
    stopNetworkSync()
    clearTimeout(syncTimer)
  }
}
