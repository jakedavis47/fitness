import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { db } from '../db'
import PageHeader from '../components/PageHeader'

export default function Routines() {
  const routines = useLiveQuery(() => db.routines.orderBy('name').toArray(), []) ?? []

  return (
    <div>
      <PageHeader
        title="Routines"
        action={
          <Link
            to="/routines/new"
            className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-medium text-neutral-950"
          >
            + New
          </Link>
        }
      />
      <div className="space-y-2 p-4">
        {routines.length === 0 && (
          <p className="text-sm text-neutral-500">
            No routines yet. Create one to quickly start a workout with your usual exercises.
          </p>
        )}
        {routines.map((r) => (
          <Link
            key={r.id}
            to={`/routines/${r.id}`}
            className="block rounded-xl border border-neutral-800 px-4 py-3"
          >
            <div className="font-medium">{r.name}</div>
            <div className="text-xs text-neutral-500">
              {r.exercises.reduce((total, exercise) => total + exercise.targetSets, 0)} working sets
              {' · '}{r.exercises.length} exercises
              {r.exercises.some((exercise) => exercise.supersetGroup) ? ' · includes superset' : ''}
            </div>
            {r.notes && <div className="mt-1 line-clamp-2 text-xs text-neutral-400">{r.notes}</div>}
          </Link>
        ))}
      </div>
    </div>
  )
}
