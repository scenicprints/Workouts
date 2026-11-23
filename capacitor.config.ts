import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.scenicprints.workouts',
  appName: 'Workouts',
  webDir: 'dist',
  android: {
    // Keep the web view out from under the status and navigation bars.
    adjustMarginsForEdgeToEdge: 'force',
    backgroundColor: '#0e0f12',
  },
  backgroundColor: '#0e0f12',
}

export default config
