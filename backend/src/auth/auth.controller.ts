import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { UpdateDailyCheckDto } from './dto/update-daily-check.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, RequestUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.auth.resendVerification(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: RequestUser) {
    return this.auth.getProfile(user.userId);
  }

  @Patch('me/daily-check')
  @UseGuards(JwtAuthGuard)
  updateDailyCheck(@CurrentUser() user: RequestUser, @Body() dto: UpdateDailyCheckDto) {
    return this.auth.updateDailyCheckSchedule(user.userId, dto);
  }
}
