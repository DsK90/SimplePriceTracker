import type { PlanTier } from '@prisma/client';

/** Active trackings allowed without a paid plan */
export const FREE_TRACKING_LIMIT = 5;

/** Max products with email price alerts enabled (free plan) */
export const FREE_EMAIL_ALERT_SLOTS = 2;

/** Max products with email price alerts enabled (Pro plan) */
export const PRO_EMAIL_ALERT_SLOTS = 10;

/** Min recheck interval: 1 min in dev, 30 min when NODE_ENV=production */
export function minRecheckIntervalMinutes(nodeEnv: string | undefined): number {
  return nodeEnv === 'production' ? 30 : 1;
}

export function emailAlertSlotsForPlan(planTier: PlanTier): number {
  return planTier === 'PRO' ? PRO_EMAIL_ALERT_SLOTS : FREE_EMAIL_ALERT_SLOTS;
}
