import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
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
  }
}
