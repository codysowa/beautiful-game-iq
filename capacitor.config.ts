import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.beautifulgameiq.app',
  appName: 'Beautiful Game IQ',
  webDir: 'dist',
  bundledWebRuntime: false,
  ios: {
    scheme: 'beautifulgameiq',
  },

}

export default config
