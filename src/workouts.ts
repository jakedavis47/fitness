import { db } from './db'

export async function deleteWorkout(workoutId: string): Promise<void> {
  await db.transaction('rw', db.workouts, db.sets, db.syncQueue, async () => {
    await db.sets.where('workoutId').equals(workoutId).delete()
    await db.workouts.delete(workoutId)
  })
}
