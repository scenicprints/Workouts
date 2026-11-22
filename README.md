# Workouts

A fresh, clean workout app that runs in the browser and keeps every byte of your data on your device.

**Live app:** https://scenicprints.github.io/Workouts/

Open it on your phone and choose "Add to Home Screen" to install it. It works offline after the first load.

## What it does

- **Progress dashboard first.** Streak, sessions and volume this week, an 8-week volume chart, recent PRs and your bodyweight trend, with today's session one tap away at the top.
- **Fast set logging.** One exercise at a time with an exercise bar across the top. Each set shows last time's numbers, pre-filled weight and reps, and one tap logs it and starts the rest timer. Upcoming sets follow what you just lifted. Warm-up sets, a plate calculator, exercise swaps within the same muscle group, and a running session clock.
- **Program generator.** Pick a goal (strength, size, general fitness, conditioning), days per week, session length, weeks and deloads, and skip any equipment you lack. You get a split built from the big lifts with sets, reps, rest and increments filled in. Or build routines and plans by hand.
- **Progression on reps and weight only.** Hit every target rep and the next session's weight goes up by the increment; miss and it repeats. Deload weeks drop to 90%. No effort ratings.
- **The plan is a sequence, not a calendar.** Finishing a workout moves it one day. Skip or jump to any day yourself; the app never guesses what to do with a missed day.
- **Body tracking.** Bodyweight with a 7-day average and 30-day change, measurements with deltas, and a quick how-do-you-feel rating.
- **Compare with a friend through GitHub.** Optional. Each person's summary and backup goes into one file in a private repo, written with a fine-grained token that lives only on the device. The Friends page compares streaks, weekly volume and best lifts. No server, no accounts.
- **Private by design.** Data lives in IndexedDB in your browser. No analytics. Export and import a JSON backup from Settings.
- **Out of scope for good:** cardio and GPS, any social feed, likes or comments, nutrition.

## Stack

- React 19 + TypeScript, built with Vite
- Dexie (IndexedDB) for storage, `dexie-react-hooks` for live queries
- `react-router-dom` with hash routing so it works on GitHub Pages
- `vite-plugin-pwa` for the manifest and offline service worker
- Vitest for tests, oxlint for linting

No UI framework. Plain CSS with custom properties, dark and light themes from the system setting.

## Develop

```powershell
npm install
npm run dev
```

```powershell
npm test
npm run lint
npm run build
```

The GitHub sync test is skipped unless a token is present. To run it against the private data repo:

```powershell
$env:WORKOUTS_SYNC_TOKEN = (gh auth token); npm test
```

`npm run icons` regenerates the PNG app icons from `scripts/make-icons.mjs` (no native dependencies).

## Deploy

Pushing to `main` runs lint, tests and the build, then publishes `dist/` to GitHub Pages via `.github/workflows/deploy.yml`. The app is built with `base: '/Workouts/'`; set `VITE_BASE=/` to build for a root domain.

## Layout

```
src/
  db.ts              Dexie schema, types, seed exercises, backup import/export
  lib/progression.ts Target weights, deloads, plan position, 1RM estimate
  lib/sessions.ts    Start / finish / discard workouts, plan cursor, skip and jump
  lib/generator.ts   Program generator: splits, prescriptions, exercise rotation
  lib/stats.ts       Weekly stats, best lifts, the summary that gets synced
  lib/sync.ts        GitHub contents API push and pull
  lib/plates.ts      Plate calculator
  lib/format.ts      Dates, durations, weekly streak
  lib/alerts.ts      Beep and vibrate
  hooks/             Rest timer store, settings
  components/        Layout, rest timer bar, exercise picker, number field, charts, plate calculator
  pages/             Home, Workout, History, Body, More, Generate, Friends, Library, Exercise, Routine, Plan, Settings
  test/              Vitest suites
```

## License

MIT
