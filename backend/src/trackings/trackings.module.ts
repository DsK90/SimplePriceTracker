import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TrackingsController } from './trackings.controller';
import { TrackingsScheduler } from './trackings.scheduler';
import { TrackingsService } from './trackings.service';

@Module({
  imports: [NotificationsModule],
  controllers: [TrackingsController],
  providers: [TrackingsService, TrackingsScheduler],
  exports: [TrackingsService],
})
export class TrackingsModule {}
