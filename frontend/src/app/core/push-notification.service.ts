import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { catchError, firstValueFrom, of } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private http = inject(HttpClient);
  private swPush = inject(SwPush, { optional: true });

  canUsePush(): boolean {
    return (
      typeof globalThis.Notification !== 'undefined' &&
      typeof globalThis.ServiceWorker !== 'undefined' &&
      this.swPush != null &&
      environment.serviceWorker
    );
  }

  async getVapidPublicKey(): Promise<string | null> {
    const r = await firstValueFrom(
      this.http.get<{ publicKey: string | null }>(`${environment.apiUrl}/notifications/push/vapid-public`),
    );
    return r.publicKey;
  }

  async refreshPushState(): Promise<{
    serverConfigured: boolean;
    subscribed: boolean;
    permission: NotificationPermission | 'unsupported';
  }> {
    if (!this.canUsePush()) {
      return { serverConfigured: false, subscribed: false, permission: 'unsupported' };
    }
    const publicKey = await this.getVapidPublicKey();
    if (!publicKey) {
      return { serverConfigured: false, subscribed: false, permission: Notification.permission };
    }
    const sub = await firstValueFrom(this.swPush!.subscription);
    return {
      serverConfigured: true,
      subscribed: !!sub,
      permission: Notification.permission,
    };
  }

  async syncSubscriptionToServer(): Promise<void> {
    if (!this.swPush) return;
    const publicKey = await this.getVapidPublicKey();
    if (!publicKey) return;
    const sub = await firstValueFrom(this.swPush.subscription);
    if (!sub) return;
    await firstValueFrom(
      this.http
        .post(`${environment.apiUrl}/notifications/push/subscribe`, sub.toJSON())
        .pipe(catchError(() => of(null))),
    );
  }

  async subscribe(): Promise<{ ok: boolean; reason?: 'denied' | 'error' }> {
    if (!this.swPush) return { ok: false, reason: 'error' };
    const publicKey = await this.getVapidPublicKey();
    if (!publicKey) return { ok: false, reason: 'error' };
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: 'denied' };
    const newSub = await this.swPush.requestSubscription({
      serverPublicKey: publicKey,
    });
    await firstValueFrom(
      this.http.post(`${environment.apiUrl}/notifications/push/subscribe`, newSub.toJSON()),
    );
    return { ok: true };
  }

  async unsubscribe(): Promise<void> {
    if (!this.swPush) return;
    const sub = await firstValueFrom(this.swPush.subscription);
    const endpoint = sub?.endpoint;
    if (endpoint) {
      await firstValueFrom(
        this.http
          .delete(`${environment.apiUrl}/notifications/push/subscribe`, {
            body: { endpoint },
          })
          .pipe(catchError(() => of(null))),
      );
    }
    await this.swPush.unsubscribe();
  }
}
