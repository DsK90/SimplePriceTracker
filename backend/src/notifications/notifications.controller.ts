import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { PushSubscribeDto, PushUnsubscribeDto } from './dto/push-subscribe.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get('push/vapid-public')
  pushVapidPublic(@CurrentUser() _user: RequestUser) {
    return this.notifications.pushVapidPublicKey();
  }

  @Post('push/subscribe')
  pushSubscribe(@CurrentUser() user: RequestUser, @Body() body: PushSubscribeDto) {
    return this.notifications.savePushSubscription(user.userId, body);
  }

  @Delete('push/subscribe')
  pushUnsubscribe(@CurrentUser() user: RequestUser, @Body() body: PushUnsubscribeDto) {
    return this.notifications.removePushSubscription(user.userId, body.endpoint);
  }

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.notifications.list(user.userId);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: RequestUser) {
    return this.notifications.unreadCount(user.userId).then((count) => ({ count }));
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.notifications.markRead(user.userId, id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: RequestUser) {
    return this.notifications.markAllRead(user.userId);
  }
}
