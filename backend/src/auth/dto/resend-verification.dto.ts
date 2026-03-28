import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { MAIL_LOCALES } from '../../mail/i18n/mail-locale';

export class ResendVerificationDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  /** When set, used for this e-mail and saved as `preferredLocale` for future mail. */
  @IsOptional()
  @IsString()
  @IsIn([...MAIL_LOCALES])
  locale?: string;
}
