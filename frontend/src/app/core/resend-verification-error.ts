import { HttpErrorResponse } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';

type ResendScope = 'register' | 'login';

export function resendVerificationErrorMessage(
  err: unknown,
  translate: TranslateService,
  scope: ResendScope,
): string {
  const e = err as HttpErrorResponse;
  const body = e?.error as { code?: string; retryAfterSeconds?: number } | undefined;
  if (e?.status === 429 && body?.code === 'RESEND_COOLDOWN') {
    const sec = typeof body.retryAfterSeconds === 'number' ? body.retryAfterSeconds : 60;
    return translate.instant(`${scope}.resendCooldown`, { seconds: sec });
  }
  if (e?.status === 429 && body?.code === 'RESEND_LIMIT_REACHED') {
    return translate.instant(`${scope}.resendLimit`);
  }
  return translate.instant(`${scope}.resendFailed`);
}
