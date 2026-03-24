export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',
  /** Register Angular service worker (needed for Web Push / SwPush in dev). */
  serviceWorker: true,
  /** PayPal client ID (sandbox or live) — set for subscription buttons */
  paypalClientId: '',
  /** Must match backend min recheck interval (dev: 1 min, prod build: 30 min) */
  minRecheckIntervalMinutes: 1,
  /** Demo product + price nudge (notifications testing). Off in environment.prod.ts. */
  enableDemoProduct: true,
};
