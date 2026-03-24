import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { MailModule } from './mail/mail.module';
import { PaypalModule } from './paypal/paypal.module';
import { PlansModule } from './plans/plans.module';
import { PrismaModule } from './prisma/prisma.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TrackingsModule } from './trackings/trackings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    PlansModule,
    TrackingsModule,
    NotificationsModule,
    PaypalModule,
    MailModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
