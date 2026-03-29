import { IsBoolean, Equals, IsString, MinLength } from 'class-validator';

export class ActivateSubscriptionDto {
  @IsString()
  @MinLength(10)
  subscriptionId: string;

  /** Must be true — user re-confirms Terms before paid subscription (in addition to registration). */
  @IsBoolean()
  @Equals(true)
  acceptSubscriptionTerms!: boolean;
}
