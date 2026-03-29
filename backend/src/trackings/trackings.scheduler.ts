import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TrackingsService } from './trackings.service';

@Injectable()
export class TrackingsScheduler {
  private readonly log = new Logger(TrackingsScheduler.name);

  constructor(private trackings: TrackingsService) {}

  /**
   * Every minute: run the once-per-day (per user) catalog refresh when local time matches.
   */
  @Cron('* * * * *')
  async refreshPrices() {
    this.log.debug('Scheduled daily price check tick');
    await this.trackings.runScheduledDailyPriceChecks();
  }
}
