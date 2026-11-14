# Lift Log

A mobile workout tracker built with React, Vite, Dexie, and Supabase. Workouts save locally in IndexedDB, including offline. Signed-in users sync their exercises, routines, sets, and workout history to their own Supabase account.

## Current deployment

- App: https://fitness-j-davis.vercel.app
- Supabase project: [fitness](https://supabase.com/dashboard/project/fhgjbgoamfysjqimaled)
- Vercel project: [fitness](https://vercel.com/jd-avis/fitness)

The first production deployment was uploaded from this checkout through MCP. GitHub automatic deployments are not linked. Local Vercel project metadata is saved in the ignored `.vercel/project.json` file.

## Local development

Use Node.js 24 and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Fill in the Supabase project URL and publishable key in `.env.local`. The legacy `VITE_SUPABASE_ANON_KEY` name is also supported. Frontend environment variables contain only public project credentials; secret and service-role keys belong outside the browser.

```sh
npm run build
npm run lint
npm test
```

## Supabase setup

1. Create a project named `fitness` in your Supabase organization.
2. Apply `supabase/schema.sql` in the new project's SQL Editor. It creates the record store, per-user row security, and atomic upload functions. The script can be run again without deleting workout data.
3. Enable email/password authentication. Set the password minimum to 8 characters.
4. Set the Auth Site URL to the final Vercel production URL. Allow that URL and `http://127.0.0.1:5173/` / `http://localhost:5173/` as redirect URLs. Add explicit preview URLs if you will test signups in preview deployments. See [Supabase's redirect documentation](https://supabase.com/docs/guides/auth/redirect-urls).
5. Copy the project URL and publishable key from the project's API settings. A [publishable key is designed for browser use](https://supabase.com/docs/guides/getting-started/api-keys); row security protects each user's data.

The app uses last-write-wins per record. Deleted records stay in Supabase as tombstones so another device cannot restore them accidentally. Local changes and their outbox entries share a database transaction; cloud downloads skip records with edits waiting to upload.

## Vercel setup

Deploy this repository using Vercel's Vite preset. The checked-in `vercel.json` sets `npm run build`, the `dist` output directory, and the SPA rewrite required to open workout/history URLs directly. See [Vercel's Vite documentation](https://vercel.com/docs/frameworks/frontend/vite).

Set these build environment variables for deployments that should connect to this Supabase project:

```text
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Rebuild after changing either value. Prefer a separate Supabase test project for preview deployments that will modify data.

## Move existing browser data to your phone

1. Configure the local app with the same Supabase project used by the hosted app, then restart Vite.
2. In the browser where you logged existing workouts, create an account or sign in on Today. Confirm your email if prompted, then wait for **All workout data is synced**.
3. Open the Vercel URL on your phone and sign in with the same account. History and progress download automatically. Add the website to your Home Screen if you want to use it as an app.
4. Log a test set on the phone and verify it appears on the computer after focusing the app or pressing Sync. Repeat with the phone offline, then reconnect and verify the set uploads.

Browser storage belongs to its exact origin. The localhost and Vercel copies only share data after you sign in and sync them. On startup, the app removes workouts explicitly marked with `isSample` and their sets. Sync also removes downloaded samples and uploads deletion tombstones so older devices cannot restore them. Real workouts and their sets are preserved.

The five program routines (Lift A1, A2, B, C1, and C2) and their exercise definitions are bundled with the app and installed for every new browser, including signed-out users. Each user can customize their own copies; routine edits and workout history remain private to their account. Startup preserves personal edits, custom routines, and deliberately deleted defaults.

Use a separate account for a workout partner. A browser already linked to an account blocks switching to a different owner to avoid mixing workout histories.
