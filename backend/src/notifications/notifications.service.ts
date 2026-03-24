import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { WebPushService } from './web-push.service';
import type { PushSubscribeDto } from './dto/push-subscribe.dto';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private webPush: WebPushService,
  ) {}

  list(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, read: false } });
  }

  async markRead(userId: string, id: string) {
    const n = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!n) throw new NotFoundException();
    return this.prisma.notification.update({ where: { id }, data: { read: true } });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { ok: true as const };
  }

  async notifyPriceAlert(
    userId: string,
    userEmail: string,
    trackingId: string,
    title: string,
    body: string,
  ) {
    await this.prisma.notification.create({
      data: { userId, trackingId, kind: 'PRICE_ALERT', title, body },
    });
    await this.mail.sendPriceAlert(userEmail, title, body);
    await this.webPush.sendToUser(userId, title, body);
  }

  pushVapidPublicKey() {
    return { publicKey: this.webPush.getPublicKey() };
  }

  async savePushSubscription(userId: string, dto: PushSubscribeDto) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
      update: {
        userId,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
    });
    return { ok: true as const };
  }

  async removePushSubscription(userId: string, endpoint: string) {
    const r = await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return { ok: true as const, removed: r.count };
  }
}
