export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',
  /** PayPal client ID (sandbox or live) — set for subscription buttons */
  paypalClientId: '',
  /** Must match backend min recheck interval (dev: 1 min, prod build: 30 min) */
  minRecheckIntervalMinutes: 1,
};
