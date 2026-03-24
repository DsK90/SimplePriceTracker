import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';

export class PushSubscriptionKeysDto {
  @IsString()
  p256dh!: string;

  @IsString()
  auth!: string;
}

/** Body from `PushSubscription.toJSON()` (browser Web Push API). */
export class PushSubscribeDto {
  @IsString()
  endpoint!: string;

  @IsOptional()
  expirationTime?: number | null;

  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}

export class PushUnsubscribeDto {
  @IsString()
  endpoint!: string;
}
