import { Equals, IsBoolean, IsEmail, IsString, MinLength } from 'class-validator';

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
}
