import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(32)
  @MaxLength(4096)
  token: string;

  @IsString()
  @MinLength(8)
  password: string;
}
