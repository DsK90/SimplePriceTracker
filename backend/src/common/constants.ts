/** Active trackings allowed without a paid plan */
export const FREE_TRACKING_LIMIT = 5;

/** Min recheck interval: 1 min in dev, 30 min when NODE_ENV=production */
export function minRecheckIntervalMinutes(nodeEnv: string | undefined): number {
  return nodeEnv === 'production' ? 30 : 1;
}
