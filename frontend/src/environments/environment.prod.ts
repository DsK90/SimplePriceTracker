import { envGenerated } from './environment.generated';

/** Production bundle: values come from scripts/generate-env.cjs (local .env) or Docker ENV during `npm run build`. */
export const environment = {
  production: true,
  apiUrl: '/api',
  serviceWorker: true,
  umamiScriptUrl: envGenerated.umamiScriptUrl,
  umamiWebsiteId: envGenerated.umamiWebsiteId,
  paypalClientId: envGenerated.paypalClientId,
  /** Must match backend min recheck when NODE_ENV=production */
  minRecheckIntervalMinutes: 30,
  enableDemoProduct: false,
};
