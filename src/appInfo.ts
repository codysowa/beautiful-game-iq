import { Capacitor } from '@capacitor/core'

export const APP_VERSION = '2.0.0'
export const APP_PLATFORM = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web'
