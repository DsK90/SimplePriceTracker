import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateTrackingDto {
  /** Switch to another catalog product; updates URL, title, shop name and price from feed. */
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(512)
  awinFeedKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10080)
  recheckIntervalMinutes?: number;

  /** Omit to leave unchanged; send null or "" to clear */
  @IsOptional()
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(200)
  productNameOverride?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(120)
  companyNameOverride?: string | null;

  /** Omit to leave unchanged; send null to clear */
  @IsOptional()
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  alertBelowPrice?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  alertAbovePrice?: number | null;

  @IsOptional()
  @IsBoolean()
  emailAlertsEnabled?: boolean;
}
