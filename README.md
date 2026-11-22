# Workouts

A fresh, clean workout app that runs in the browser and keeps every byte of your data on your device.

**Live app:** https://scenicprints.github.io/Workouts/

Open it on your phone and choose "Add to Home Screen" to install it. It works offline after the first load.

## What it does

- **Log workouts.** Sets, reps and weight per exercise, with a one-tap "done" that starts the rest timer. Freeform or from a routine. A workout in progress survives closing the app.
- **Guided routines with rest timers.** Build routines with sets, reps, rest and a starting weight. A "Guided" mode walks you through one exercise at a time with a big log button. The rest timer beeps and vibrates when it is time.
- **Plans with progression.** String routines into a weekly schedule over N weeks. Every time you hit all target reps the next session's weight goes up by the increment; miss and it repeats. Optional deload weeks drop weights to 90%. The plan advances per finished workout, not per calendar day, so a missed day never breaks it.
- **Progress.** Per-exercise history, heaviest set, estimated one-rep max and a chart over time.
- **Private by design.** Data lives in IndexedDB in your browser. No account, no server, no analytics. Export and import a JSON backup from Settings.

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

`npm run icons` regenerates the PNG app icons from `scripts/make-icons.mjs` (no native dependencies).

## Deploy

Pushing to `main` runs lint, tests and the build, then publishes `dist/` to GitHub Pages via `.github/workflows/deploy.yml`. The app is built with `base: '/Workouts/'`; set `VITE_BASE=/` to build for a root domain.

## Layout

```
src/
  db.ts              Dexie schema, types, seed exercises, backup import/export
  lib/progression.ts Target weights, deloads, plan position, 1RM estimate
  lib/sessions.ts    Start / finish / discard workouts, next plan workout
  lib/format.ts      Dates, durations, weekly streak
  lib/alerts.ts      Beep and vibrate
  hooks/             Rest timer store, settings
  components/        Layout, rest timer bar, exercise picker, number field
  pages/             Home, Workout, History, Library, Exercise, Routine, Plan, Settings
  test/              Vitest suites
```

## License

MIT
