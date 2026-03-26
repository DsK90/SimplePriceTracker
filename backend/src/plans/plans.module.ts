import { Module } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { PlansInitializerService } from './plans-initializer.service';
import { PlansService } from './plans.service';

@Module({
  controllers: [PlansController],
  providers: [PlansService, PlansInitializerService],
})
export class PlansModule {}
