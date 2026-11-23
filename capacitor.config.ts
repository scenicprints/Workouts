import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.scenicprints.workouts',
  appName: 'Workouts',
  webDir: 'dist',
  android: {
    // Keep the web view out from under the status and navigation bars.
    adjustMarginsForEdgeToEdge: 'force',
    backgroundColor: '#f6f5f2',
  },
  backgroundColor: '#f6f5f2',
}

export default config
