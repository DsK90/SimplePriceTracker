import { IsString, MinLength } from 'class-validator';

export class ActivateSubscriptionDto {
  @IsString()
  @MinLength(10)
  subscriptionId: string;
}
