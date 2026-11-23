import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.scenicprints.workouts',
  appName: 'Workouts',
  webDir: 'dist',
  android: {
    // Keep the web view out from under the status and navigation bars.
    adjustMarginsForEdgeToEdge: 'force',
    backgroundColor: '#0b0f1a',
  },
  backgroundColor: '#0b0f1a',
}

export default config
