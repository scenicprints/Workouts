// Builds the web app for the native shell (served from the app root, not /Workouts/) and syncs it
// into the Android project. Run: npm run build:native
import { execSync } from 'node:child_process'

const run = (cmd) => {
  console.log(`> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', env: { ...process.env, VITE_BASE: '/' } })
}

run('npx tsc -b')
run('npx vite build')
run('npx cap sync android')
