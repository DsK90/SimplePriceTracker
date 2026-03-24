import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

/** Payload shape expected by Angular's `ngsw-worker.js` `handlePush`. */
function ngswPushPayload(title: string, body: string) {
  return JSON.stringify({
    notification: { title, body },
  });
}

@Injectable()
export class WebPushService {
  private readonly log = new Logger(WebPushService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    const pub = this.config.get<string>('VAPID_PUBLIC_KEY');
    const priv = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:noreply@localhost';
    if (pub && priv) {
      webpush.setVapidDetails(subject, pub, priv);
    }
  }

  isConfigured(): boolean {
    return !!(
      this.config.get<string>('VAPID_PUBLIC_KEY') && this.config.get<string>('VAPID_PRIVATE_KEY')
    );
  }

  getPublicKey(): string | null {
    return this.config.get<string>('VAPID_PUBLIC_KEY') ?? null;
  }

  async sendToUser(userId: string, title: string, body: string): Promise<void> {
    if (!this.isConfigured()) return;

    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (!subs.length) return;

    const payload = ngswPushPayload(title, body);
    const buf = Buffer.from(payload, 'utf8');

    for (const sub of subs) {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(pushSub, buf, { TTL: 86400 });
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 410 || status === 404) {
          await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          this.log.warn(`Web Push failed for subscription ${sub.id}: ${String(err)}`);
        }
      }
    }
  }
}
