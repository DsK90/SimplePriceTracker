import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { MAIL_LOCALES } from '../../mail/i18n/mail-locale';

export class ForgotPasswordDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @IsIn([...MAIL_LOCALES])
  locale?: string;
}
