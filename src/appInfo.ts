import { Capacitor } from '@capacitor/core'

export const APP_VERSION = '1.0.1'
export const APP_PLATFORM = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web'
