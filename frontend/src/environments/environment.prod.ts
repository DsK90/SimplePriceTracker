export const environment = {
  production: true,
  apiUrl: '/api',
  serviceWorker: true,
  /** Replaced at Docker build via __PAYPAL_CLIENT_ID__ placeholder */
  paypalClientId: '__PAYPAL_CLIENT_ID__',
  /** Must match backend min recheck when NODE_ENV=production */
  minRecheckIntervalMinutes: 30,
  enableDemoProduct: false,
};
