import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PlanTier } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { ActivateSubscriptionDto } from './dto/activate-subscription.dto';
import { PaypalService } from './paypal.service';

@Controller('paypal')
export class PaypalController {
  constructor(
    private paypal: PaypalService,
    private prisma: PrismaService,
  ) {}

  @Get('status/:subscriptionId')
  @UseGuards(JwtAuthGuard)
  async status(@Param('subscriptionId') subscriptionId: string) {
    const active = await this.paypal.checkSubscriptionStatus(subscriptionId);
    return { active };
  }

  /** Call after PayPal JS SDK onApprove with subscriptionID */
  @Post('activate')
  @UseGuards(JwtAuthGuard)
  async activate(
    @CurrentUser() user: RequestUser,
    @Body() body: ActivateSubscriptionDto,
  ) {
    const active = await this.paypal.checkSubscriptionStatus(body.subscriptionId);
    if (!active) {
      return { ok: false, message: 'Subscription is not active' };
    }
    await this.prisma.user.update({
      where: { id: user.userId },
      data: {
        planTier: PlanTier.PRO,
        paypalSubscriptionId: body.subscriptionId,
      },
    });
    return { ok: true };
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard)
  async cancel(@CurrentUser() user: RequestUser) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.userId } });
    if (u.paypalSubscriptionId) {
      await this.paypal.cancelSubscription(u.paypalSubscriptionId);
    }
    await this.prisma.user.update({
      where: { id: user.userId },
      data: {
        planTier: PlanTier.FREE,
        paypalSubscriptionId: null,
      },
    });
    return { ok: true };
  }
}
