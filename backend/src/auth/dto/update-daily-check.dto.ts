import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateDailyCheckDto {
  /** Local time 24h, e.g. "08:00" or "9:30" */
  @IsString()
  @MinLength(4)
  @MaxLength(5)
  @Matches(/^([01]?\d|2[0-3]):[0-5]\d$/, { message: 'dailyCheckLocalTime must be HH:mm (24h)' })
  dailyCheckLocalTime!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  dailyCheckTimeZone!: string;
}
