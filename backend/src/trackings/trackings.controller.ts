import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, RequestUser } from '../auth/decorators/current-user.decorator';
import { DemoPriceDto } from './dto/demo-price.dto';
import { CreateTrackingDto } from './dto/create-tracking.dto';
import { ReorderTrackingsDto } from './dto/reorder-trackings.dto';
import { UpdateTrackingDto } from './dto/update-tracking.dto';
import { TrackingsService } from './trackings.service';

@Controller('trackings')
@UseGuards(JwtAuthGuard)
export class TrackingsController {
  constructor(private trackings: TrackingsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.trackings.list(user.userId);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateTrackingDto) {
    return this.trackings.create(user.userId, dto);
  }

  @Post('demo')
  createDemo(@CurrentUser() user: RequestUser) {
    return this.trackings.createDemo(user.userId);
  }

  @Patch('reorder')
  reorder(@CurrentUser() user: RequestUser, @Body() dto: ReorderTrackingsDto) {
    return this.trackings.reorder(user.userId, dto.ids);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateTrackingDto,
  ) {
    return this.trackings.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.trackings.remove(user.userId, id);
  }

  @Post(':id/refresh')
  refresh(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.trackings.refresh(user.userId, id);
  }

  @Post(':id/demo-price')
  adjustDemoPrice(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: DemoPriceDto,
  ) {
    return this.trackings.adjustDemoPrice(user.userId, id, dto.delta);
  }
}
