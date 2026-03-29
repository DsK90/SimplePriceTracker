import type { PlanTier } from '@prisma/client';

/** Admin email — bypasses all plan limits. */
export const ADMIN_EMAIL = 'doeldenberger@gmail.com';

/** Active trackings allowed without a paid plan */
export const FREE_TRACKING_LIMIT = 5;

/** Max products with email price alerts enabled (free plan) */
export const FREE_EMAIL_ALERT_SLOTS = 2;

/** Max products with email price alerts enabled (Pro plan) */
export const PRO_EMAIL_ALERT_SLOTS = 10;

export function emailAlertSlotsForPlan(planTier: PlanTier): number {
  return planTier === 'PRO' ? PRO_EMAIL_ALERT_SLOTS : FREE_EMAIL_ALERT_SLOTS;
}
