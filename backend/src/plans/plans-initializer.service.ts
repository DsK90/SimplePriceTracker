import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Seeds required Plan rows on application startup when the table is empty.
 * Replaces the manual `prisma db seed` step for Docker / CI deployments.
 */
@Injectable()
export class PlansInitializerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlansInitializerService.name);

  private static readonly PRO_MONTHLY_NET_CENTS = 399;
  private static readonly DEFAULT_PAYPAL_PLAN_ID = 'P-6TL7122718514241MNHCG5QQ';

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.ensureProPlan();
    } catch (err) {
      this.logger.error('Failed to initialise plans', err);
    }
  }

  private async ensureProPlan() {
    const paypalPlanId =
      this.config.get<string>('PAYPAL_PRO_PLAN_ID') ||
      PlansInitializerService.DEFAULT_PAYPAL_PLAN_ID;

    const existing = await this.prisma.plan.findUnique({
      where: { slug: 'pro-monthly' },
    });

    if (existing) {
      if (existing.paypalPlanId !== paypalPlanId) {
        await this.prisma.plan.update({
          where: { slug: 'pro-monthly' },
          data: { paypalPlanId },
        });
        this.logger.log(`Updated pro-monthly paypalPlanId → ${paypalPlanId}`);
      }
      return;
    }

    await this.prisma.plan.create({
      data: {
        name: 'Pro',
        slug: 'pro-monthly',
        description: null,
        priceCents: PlansInitializerService.PRO_MONTHLY_NET_CENTS,
        currency: 'EUR',
        paypalPlanId,
        maxTrackings: null,
        sortOrder: 10,
      },
    });
    this.logger.log('Created pro-monthly plan');
  }
}
