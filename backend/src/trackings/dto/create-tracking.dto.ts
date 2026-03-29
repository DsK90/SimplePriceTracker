import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateTrackingDto {
  /** Key from Awin catalog search / feed (`advertiser_id:aw_product_id` or custom feed_key column). */
  @IsString()
  @MinLength(3)
  @MaxLength(512)
  awinFeedKey: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  alertBelowPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  alertAbovePrice?: number;

  @IsOptional()
  @IsBoolean()
  emailAlertsEnabled?: boolean;
}
