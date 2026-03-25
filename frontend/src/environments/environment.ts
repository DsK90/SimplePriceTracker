import { envGenerated } from './environment.generated';

export const environment = {
  production: false,
  /** From frontend/.env via scripts/generate-env.cjs (NG_API_URL / FRONTEND_API_URL). */
  apiUrl: envGenerated.apiUrl,
  /** Register Angular service worker (needed for Web Push / SwPush in dev). */
  serviceWorker: true,
  /** Umami: UMAMI_SCRIPT_URL or UMAMI_HOST_URL + /script.js, plus UMAMI_WEBSITE_ID in .env */
  umamiScriptUrl: envGenerated.umamiScriptUrl,
  umamiWebsiteId: envGenerated.umamiWebsiteId,
  /** PayPal: PAYPAL_CLIENT_ID or PAYPAL_SANDBOX_CLIENT_ID per PAYPAL_USE_SANDBOX */
  paypalClientId: envGenerated.paypalClientId,
  /** Must match backend min recheck interval (dev: 1 min, prod build: 30 min) */
  minRecheckIntervalMinutes: 1,
  /** Demo product + price nudge (notifications testing). Off in environment.prod.ts. */
  enableDemoProduct: true,
};
