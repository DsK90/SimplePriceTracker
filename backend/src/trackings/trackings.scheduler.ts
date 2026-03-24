import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TrackingsService } from './trackings.service';

@Injectable()
export class TrackingsScheduler {
  private readonly log = new Logger(TrackingsScheduler.name);

  constructor(private trackings: TrackingsService) {}

  /**
   * Every minute: only items whose recheck interval has elapsed (1 min minimum in dev;
   * production enforces 30 min minimum per item in TrackingsService).
   */
  @Cron('* * * * *')
  async refreshPrices() {
    this.log.debug('Scheduled due price checks tick');
    await this.trackings.refreshDueTrackings();
  }
}
