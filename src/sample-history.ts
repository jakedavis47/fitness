import { db } from './db'

export async function removeSampleHistory(): Promise<number> {
  return db.transaction('rw', db.workouts, db.sets, db.syncQueue, async () => {
    const ids = await db.workouts.filter((workout) => workout.isSample === true).primaryKeys()
    if (ids.length === 0) return 0
    await db.sets.where('workoutId').anyOf(ids).delete()
    await db.workouts.bulkDelete(ids)
    return ids.length
  })
}
