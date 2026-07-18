import type { TwoYouApi } from '../electron/preload'

declare global {
  interface Window {
    twoYou: TwoYouApi
  }
}

export {}
