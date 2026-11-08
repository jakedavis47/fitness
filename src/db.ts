import Dexie, { type EntityTable } from 'dexie'

export interface Exercise {
  id: string
  name: string
  weightInputMode?: 'weight' | 'plates'
}

export interface WorkoutSet {
  id: string
  workoutId: string
  exerciseId: string
  order: number
  weight: number
  reps: number
  plateLoading?: {
    platesPerSide: number
    extraPerSide: number
  }
}

export interface Workout {
  id: string
  date: string // ISO date string, e.g. 2026-09-07
  name: string
  routineId?: string
  notes?: string
  finishedAt?: string
  isSample?: boolean
  exerciseIds: string[] // order in which exercises appear in this workout
}

export interface Routine {
  id: string
  name: string
  exercises: RoutineExercise[]
  notes?: string
}

export interface RoutineExercise {
  exerciseId: string
  targetSets: number
  minReps: number
  maxReps: number
  perSide?: boolean
  restSeconds?: number
  supersetGroup?: string
  supersetOrder?: number
  transitionSeconds?: number
}

export type SyncCollection = 'exercises' | 'sets' | 'workouts' | 'routines'

export interface SyncChange {
  id: string
  userId: string
  collection: SyncCollection
  recordId: string
  action: 'upsert' | 'delete'
  payload?: Exercise | WorkoutSet | Workout | Routine
  queuedAt: number
}

export const db = new Dexie('lift-log') as Dexie & {
  exercises: EntityTable<Exercise, 'id'>
  sets: EntityTable<WorkoutSet, 'id'>
  workouts: EntityTable<Workout, 'id'>
  routines: EntityTable<Routine, 'id'>
  syncQueue: EntityTable<SyncChange, 'id'>
}

db.version(1).stores({
  exercises: 'id, name',
  sets: 'id, workoutId, exerciseId, order',
  workouts: 'id, date',
  routines: 'id, name',
})

const builtInRoutines: Routine[] = [
  {
    id: 'built-in-lift-a',
    name: 'Lift A1 — Chest, Shoulders, Triceps + Abs',
    exercises: [
      { exerciseId: 'incline-db-press', targetSets: 2, minReps: 6, maxReps: 10, restSeconds: 180 },
      { exerciseId: 'pec-deck', targetSets: 2, minReps: 8, maxReps: 15, restSeconds: 120 },
      { exerciseId: 'cable-lateral-raise', targetSets: 2, minReps: 10, maxReps: 15, restSeconds: 120 },
      { exerciseId: 'rope-pressdown', targetSets: 2, minReps: 8, maxReps: 15, restSeconds: 120 },
      { exerciseId: 'cable-crunch', targetSets: 3, minReps: 8, maxReps: 15, restSeconds: 120 },
      { exerciseId: 'pallof-press', targetSets: 2, minReps: 10, maxReps: 15, perSide: true, restSeconds: 120 },
    ],
  },
  {
    id: 'built-in-lift-a2',
    name: 'Lift A2 — Chest, Shoulders, Triceps + Abs',
    exercises: [
      { exerciseId: 'machine-chest-press', targetSets: 2, minReps: 6, maxReps: 10, restSeconds: 180 },
      { exerciseId: 'cable-fly', targetSets: 2, minReps: 8, maxReps: 15, restSeconds: 120 },
      { exerciseId: 'cable-lateral-raise', targetSets: 2, minReps: 10, maxReps: 15, restSeconds: 120 },
      { exerciseId: 'rope-pressdown', targetSets: 2, minReps: 8, maxReps: 15, restSeconds: 120 },
      { exerciseId: 'cable-crunch', targetSets: 3, minReps: 8, maxReps: 15, restSeconds: 120 },
      { exerciseId: 'pallof-press', targetSets: 2, minReps: 10, maxReps: 15, perSide: true, restSeconds: 120 },
    ],
  },
  {
    id: 'built-in-lift-b',
    name: 'Lift B — Legs + Glutes + Lower Back/Core',
    exercises: [
      { exerciseId: 'leg-press', targetSets: 2, minReps: 6, maxReps: 10, restSeconds: 180 },
      { exerciseId: 'hip-thrust-glute-drive-machine', targetSets: 2, minReps: 6, maxReps: 10, restSeconds: 180 },
      { exerciseId: 'leg-extension', targetSets: 2, minReps: 8, maxReps: 15, restSeconds: 120 },
      { exerciseId: 'leg-curl', targetSets: 2, minReps: 8, maxReps: 15, restSeconds: 120 },
      { exerciseId: '45-degree-back-extension', targetSets: 2, minReps: 10, maxReps: 15, restSeconds: 120 },
      { exerciseId: 'hanging-knee-captains-chair-raise', targetSets: 3, minReps: 8, maxReps: 15, restSeconds: 120 },
    ],
  },
  {
    id: 'built-in-lift-c',
    name: 'Lift C1 — Back, Rear Delts, Biceps + Abs',
    exercises: [
      { exerciseId: 'wide-grip-pulldown-pull-up', targetSets: 2, minReps: 6, maxReps: 10, restSeconds: 180 },
      { exerciseId: 'chest-supported-row', targetSets: 2, minReps: 6, maxReps: 10, restSeconds: 180 },
      { exerciseId: 'rear-delt-fly', targetSets: 2, minReps: 8, maxReps: 15, restSeconds: 120 },
      { exerciseId: 'cable-curl', targetSets: 2, minReps: 8, maxReps: 15, restSeconds: 120 },
      { exerciseId: 'weighted-machine-crunch', targetSets: 3, minReps: 8, maxReps: 15, restSeconds: 120 },
      { exerciseId: 'cable-wood-chop', targetSets: 2, minReps: 10, maxReps: 15, perSide: true, restSeconds: 120 },
    ],
  },
]

const liftC1 = builtInRoutines.find((routine) => routine.id === 'built-in-lift-c')!
builtInRoutines.push({
  ...liftC1,
  id: 'built-in-lift-c2',
  name: 'Lift C2 — Back, Rear Delts, Biceps + Abs',
  exercises: liftC1.exercises.map((exercise) => ({
    ...exercise,
    exerciseId: exercise.exerciseId === 'chest-supported-row' ? 'high-row' : exercise.exerciseId,
  })),
})

const builtInExercises: Exercise[] = [
  { id: 'machine-chest-press', name: 'Machine press' },
  { id: 'leg-press', name: 'Leg press' },
  { id: 'chest-supported-row', name: 'Chest-supported row' },
  { id: 'high-row', name: 'High row' },
  { id: 'hip-thrust-glute-drive-machine', name: 'Hip thrust' },
  { id: 'cable-lateral-raise', name: 'Cable lateral raise' },
  { id: 'cable-crunch', name: 'Cable crunch' },
  { id: 'cable-curl', name: 'Curls' },
  { id: 'rope-pressdown', name: 'Rope triceps pushdown' },
  { id: 'lat-pulldown', name: 'Lat pulldown' },
  { id: 'bulgarian-split-squat', name: 'Bulgarian split squat' },
  { id: 'incline-machine-db-press', name: 'Incline DB or machine press' },
  { id: 'leg-curl', name: 'Leg curl' },
  { id: '45-degree-back-extension', name: '45° back extension' },
  { id: 'pallof-press', name: 'Pallof press' },
  { id: 'cable-crunch-ab-machine', name: 'Cable crunch / ab machine' },
  { id: 'pec-deck-cable-fly', name: 'Pec deck / cable fly' },
  { id: 'leg-extension', name: 'Leg extension' },
  { id: 'hanging-knee-captains-chair-raise', name: 'Hanging knee raise' },
  { id: 'wide-grip-pulldown-pull-up', name: 'Pull-up' },
  { id: 'rear-delt-fly', name: 'Rear-delt fly' },
  { id: 'ab-wheel-rollout', name: 'Ab-wheel rollout' },
  { id: 'weighted-machine-crunch', name: 'Weighted machine crunches' },
  { id: 'cable-wood-chop', name: 'Cable wood chop' },
  { id: 'incline-db-press', name: 'Incline DB press' },
  { id: 'pec-deck', name: 'Pec deck' },
  { id: 'cable-fly', name: 'Cable fly' },
]

db.version(2)
  .stores({
    exercises: 'id, name',
    sets: 'id, workoutId, exerciseId, order',
    workouts: 'id, date',
    routines: 'id, name',
  })
  .upgrade(async (transaction) => {
    const exerciseTable = transaction.table('exercises')
    const routineTable = transaction.table('routines')
    await exerciseTable.bulkPut(builtInExercises)

    const existingRoutines = await routineTable.toArray()
    for (const routine of existingRoutines) {
      const record = routine as Routine & { exerciseIds?: string[] }
      if (!Array.isArray(record.exercises) && Array.isArray(record.exerciseIds)) {
        record.exercises = record.exerciseIds.map((exerciseId) => ({
          exerciseId,
          targetSets: 2,
          minReps: 8,
          maxReps: 12,
        }))
        delete record.exerciseIds
        await routineTable.put(record)
      }
    }

    await routineTable.bulkPut(builtInRoutines)
  })

db.version(3).stores({
  exercises: 'id, name',
  sets: 'id, workoutId, exerciseId, order',
  workouts: 'id, date',
  routines: 'id, name',
  syncQueue: 'id, userId, queuedAt',
})

db.version(4)
  .stores({})
  .upgrade(async (transaction) => {
    // Update saved targets once, preserving logged sets and other routine settings.
    await transaction.table<Routine, string>('routines').toCollection().modify((routine) => {
      for (const exercise of routine.exercises) {
        if (exercise.targetSets === 3) exercise.targetSets = 2
      }
    })
  })

db.version(5)
  .stores({})
  .upgrade(async (transaction) => {
    await transaction.table<Routine, string>('routines')
      .where('id').equals('built-in-lift-b')
      .modify((routine) => {
        delete routine.notes
      })
  })

db.version(6)
  .stores({})
  .upgrade(async (transaction) => {
    // Replace the three program templates without changing logged workouts or custom routines.
    await transaction.table('exercises').bulkPut(builtInExercises)
    await transaction.table('routines').bulkPut(builtInRoutines)
  })

db.version(7)
  .stores({})
  .upgrade(async (transaction) => {
    const exerciseTable = transaction.table<Exercise, string>('exercises')
    for (const id of [
      'hip-thrust-glute-drive-machine',
      'hanging-knee-captains-chair-raise',
      'wide-grip-pulldown-pull-up',
      'cable-curl',
    ]) {
      const exercise = builtInExercises.find((item) => item.id === id)!
      await exerciseTable.update(id, { name: exercise.name })
    }
  })

db.version(8)
  .stores({})
  .upgrade(async (transaction) => {
    const exerciseIds = ['incline-db-press', 'pec-deck', 'machine-chest-press', 'cable-fly']
    await transaction.table('exercises').bulkPut(
      builtInExercises.filter((exercise) => exerciseIds.includes(exercise.id)),
    )

    const routineTable = transaction.table<Routine, string>('routines')
    const existingLiftA = await routineTable.get('built-in-lift-a')
    const variations = builtInRoutines
      .filter((routine) => routine.id === 'built-in-lift-a' || routine.id === 'built-in-lift-a2')
      .map((routine) => existingLiftA ? {
        ...existingLiftA,
        id: routine.id,
        name: routine.name,
        exercises: existingLiftA.exercises.map((exercise, index) => index < 2
          ? { ...exercise, exerciseId: routine.exercises[index].exerciseId }
          : exercise),
      } : routine)
    await routineTable.bulkPut(variations)
  })

db.version(9)
  .stores({})
  .upgrade(async (transaction) => {
    const exercise = builtInExercises.find((item) => item.id === 'weighted-machine-crunch')!
    await transaction.table('exercises').put(exercise)
    await transaction.table<Routine, string>('routines')
      .where('id').equals('built-in-lift-c')
      .modify((routine) => {
        routine.exercises = routine.exercises.map((target) => target.exerciseId === 'ab-wheel-rollout'
          ? { ...target, exerciseId: exercise.id, targetSets: 3, minReps: 8, maxReps: 15, restSeconds: 120 }
          : target)
      })
  })

db.version(10)
  .stores({})
  .upgrade(async (transaction) => {
    await transaction.table('exercises').put(builtInExercises.find((exercise) => exercise.id === 'high-row')!)
    const routineTable = transaction.table<Routine, string>('routines')
    const existingLiftC = await routineTable.get(liftC1.id) ?? liftC1
    await routineTable.bulkPut([
      { ...existingLiftC, name: liftC1.name },
      {
        ...existingLiftC,
        id: 'built-in-lift-c2',
        name: 'Lift C2 — Back, Rear Delts, Biceps + Abs',
        exercises: existingLiftC.exercises.map((exercise) => ({
          ...exercise,
          exerciseId: exercise.exerciseId === 'chest-supported-row' ? 'high-row' : exercise.exerciseId,
        })),
      },
    ])
  })

export async function ensureDefaultRoutines(): Promise<void> {
  const seedKey = 'lift-log-default-routines-seeded-v1'
  if (localStorage.getItem(seedKey)) return

  await db.transaction('rw', db.exercises, db.routines, async () => {
    for (const exercise of builtInExercises) {
      if (!(await db.exercises.get(exercise.id))) await db.exercises.add(exercise)
    }
    for (const routine of builtInRoutines) {
      if (!(await db.routines.get(routine.id))) await db.routines.add(routine)
    }
  })
  localStorage.setItem(seedKey, 'true')
}
