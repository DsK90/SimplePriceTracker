import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TrackingsService } from './trackings.service';

function priceSchedulerDisabled(): boolean {
  return process.env.PRICE_SCHEDULER_ENABLED === 'false';
}

@Injectable()
export class TrackingsScheduler implements OnModuleInit {
  private readonly log = new Logger(TrackingsScheduler.name);

  constructor(private trackings: TrackingsService) {}

  onModuleInit() {
    if (priceSchedulerDisabled()) {
      this.log.warn(
        'Automatic price checks are off (PRICE_SCHEDULER_ENABLED=false). Manual refresh in the app still works.',
      );
    }
  }

  /**
   * Every minute: run the once-per-day (per user) catalog refresh when local time matches.
   * Set PRICE_SCHEDULER_ENABLED=false to skip work (checked each tick so .env is loaded first).
   */
  @Cron('* * * * *')
  async refreshPrices() {
    if (priceSchedulerDisabled()) return;
    this.log.debug('Scheduled daily price check tick');
    await this.trackings.runScheduledDailyPriceChecks();
  }
}
