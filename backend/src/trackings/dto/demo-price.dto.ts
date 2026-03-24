import { Type } from 'class-transformer';
import { IsNumber } from 'class-validator';

export class DemoPriceDto {
  @Type(() => Number)
  @IsNumber()
  delta!: number;
}
