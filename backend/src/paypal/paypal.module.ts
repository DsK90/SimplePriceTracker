import { Module } from '@nestjs/common';
import { TrackingsModule } from '../trackings/trackings.module';
import { PaypalController } from './paypal.controller';
import { PaypalService } from './paypal.service';

@Module({
  imports: [TrackingsModule],
  controllers: [PaypalController],
  providers: [PaypalService],
  exports: [PaypalService],
})
export class PaypalModule {}
