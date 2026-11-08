import { useEffect, useState } from 'react'
import type { AuthError, Session } from '@supabase/supabase-js'
import { cloudConfigured, supabase, syncUserData } from '../sync'

export default function CloudSyncPanel() {
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleNetworkChange = () => setOnline(navigator.onLine)
    window.addEventListener('online', handleNetworkChange)
    window.addEventListener('offline', handleNetworkChange)
    const stopNetworkListener = () => {
      window.removeEventListener('online', handleNetworkChange)
      window.removeEventListener('offline', handleNetworkChange)
    }
    const handleSyncStatus = (event: Event) => {
      const { status, message: detailMessage } = (event as CustomEvent<{
        status: 'syncing' | 'synced' | 'error'
        message?: string
      }>).detail
      if (status === 'error') setError(detailMessage ?? 'Cloud sync failed.')
      else if (status === 'synced') {
        setError('')
        setMessage('All workout data is synced')
      } else setMessage('Syncing…')
    }
    window.addEventListener('lift-log-sync', handleSyncStatus)
    if (!supabase) {
      return () => {
        stopNetworkListener()
        window.removeEventListener('lift-log-sync', handleSyncStatus)
      }
    }

    let alive = true
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!alive) return
      setSession(nextSession)
      if (!nextSession) setMessage('')
    })

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!alive) return
      if (sessionError) setError(sessionError.message)
      setSession(data.session)
    })

    return () => {
      alive = false
      listener.subscription.unsubscribe()
      stopNetworkListener()
      window.removeEventListener('lift-log-sync', handleSyncStatus)
    }
  }, [])

  function messageFor(value: unknown): string {
    return value instanceof Error ? value.message : 'Cloud sync failed.'
  }

  async function authenticate(action: 'signIn' | 'signUp') {
    if (!supabase) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = action === 'signIn'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } })
      if (result.error) throw result.error as AuthError
      if (action === 'signUp' && !result.data.session) {
        setMessage('Check your email to confirm the account, then sign in here.')
      } else {
        setMessage('Signed in. Syncing your records…')
      }
    } catch (authError) {
      setError(messageFor(authError))
    } finally {
      setBusy(false)
    }
  }

  async function syncNow() {
    if (!session) return
    setBusy(true)
    setError('')
    setMessage('Syncing…')
    try {
      await syncUserData(session.user.id)
      setMessage('All workout data is synced')
    } catch (syncError) {
      setError(messageFor(syncError))
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    if (!supabase) return
    setBusy(true)
    setError('')
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError(signOutError.message)
    setBusy(false)
  }

  return (
    <section className="space-y-3 border-y border-neutral-800 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Cloud backup & sync</h2>
          <p className="text-xs text-neutral-500">
            {!online ? 'Offline; changes are saved on this device' : session ? session.user.email : 'Use the same account on each device'}
          </p>
        </div>
        {session && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={syncNow}
              disabled={busy || !online}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs disabled:opacity-40"
            >
              Sync
            </button>
            <button
              type="button"
              onClick={signOut}
              disabled={busy}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs disabled:opacity-40"
            >
              Sign out
            </button>
          </div>
        )}
      </div>

      {!cloudConfigured ? (
        <p className="text-xs text-amber-300">
          Cloud backup is not connected yet. Your workouts are saved on this device.
        </p>
      ) : !session ? (
        <div className="space-y-2">
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void authenticate('signIn')}
              disabled={busy || !online || !email.trim() || !password}
              className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-neutral-950 disabled:opacity-40"
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => void authenticate('signUp')}
              disabled={busy || !online || !email.trim() || password.length < 8}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-sm disabled:opacity-40"
            >
              Create account
            </button>
          </div>
          <p className="text-xs text-neutral-500">Use at least 8 characters for your password.</p>
        </div>
      ) : null}

      {message && <p role="status" className="text-xs text-emerald-400">{message}</p>}
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    </section>
  )
}
