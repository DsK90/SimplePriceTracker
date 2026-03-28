import { Equals, IsBoolean, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { MAIL_LOCALES } from '../../mail/i18n/mail-locale';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  /** Must be true — user accepts the published Terms of Service. */
  @IsBoolean()
  @Equals(true)
  acceptTerms!: boolean;

  /** Active UI language for verification e-mail (ngx-translate code, e.g. `de`, `en`). */
  @IsOptional()
  @IsString()
  @IsIn([...MAIL_LOCALES])
  locale?: string;
}
