import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.beautifulgameiq.app',
  appName: 'Beautiful Game IQ',
  webDir: 'dist',
  bundledWebRuntime: false,
  ios: {
    scheme: 'beautifulgameiq',
  },
  experimental: {
    ios: {
      spm: {
        packageOptions: {
          '@capacitor/app': { symlink: true },
          '@capacitor-community/admob': { symlink: true },
          '@revenuecat/purchases-capacitor': { symlink: true },
        },
      },
    },
  },
}

export default config
