import { db } from './db'
import { createSampleHistory } from './sample-data'

const initializedKey = 'lift-log-sample-history-initialized-v1'

export async function addSampleHistory(): Promise<number> {
  return db.transaction('rw', db.routines, db.workouts, db.sets, db.syncQueue, async () => {
    if (await db.workouts.filter((workout) => workout.isSample === true).count()) return 0
    const routines = await db.routines.toArray()
    const sample = createSampleHistory(routines)
    await db.workouts.bulkAdd(sample.workouts)
    await db.sets.bulkAdd(sample.sets)
    return sample.workouts.length
  })
}

export async function removeSampleHistory(): Promise<void> {
  await db.transaction('rw', db.workouts, db.sets, db.syncQueue, async () => {
    const ids = await db.workouts.filter((workout) => workout.isSample === true).primaryKeys()
    if (ids.length === 0) return
    await db.sets.where('workoutId').anyOf(ids).delete()
    await db.workouts.bulkDelete(ids)
  })
  localStorage.setItem(initializedKey, 'true')
}

export async function initializeSampleHistory(): Promise<void> {
  if (localStorage.getItem(initializedKey)) return
  await addSampleHistory()
  localStorage.setItem(initializedKey, 'true')
}
