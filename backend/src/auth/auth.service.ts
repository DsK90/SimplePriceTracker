import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { PlanTier } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ADMIN_EMAIL } from '../common/constants';
import {
  isValidIanaTimeZone,
  normalizeLocalTimeHHmm,
  parseLocalTimeHHmm,
} from '../common/daily-check-time';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateDailyCheckDto } from './dto/update-daily-check.dto';
import { normalizeMailLocale } from '../mail/i18n/mail-locale';
import { PaypalService } from '../paypal/paypal.service';
import { TrackingsService } from '../trackings/trackings.service';

/** Sign-up e-mail + resends while unverified (abuse cap). */
const VERIFICATION_EMAIL_MAX_SENDS = 6;
/** Minimum seconds between confirmation e-mails for the same account. */
const VERIFICATION_RESEND_MIN_INTERVAL_MS = 60_000;

/** Between password-reset e-mails for the same account. */
const PASSWORD_RESET_COOLDOWN_MS = 60_000;
/** Password reset link validity. */
const PASSWORD_RESET_EXPIRY_MS = 3600 * 1000;

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private mail: MailService,
    private paypal: PaypalService,
    private trackings: TrackingsService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const mailLocale = normalizeMailLocale(dto.locale);
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const state = this.prepareVerificationState();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'An account with this email already exists.',
      });
    }

    const tzRaw = dto.timeZone?.trim();
    const tzOk = tzRaw && isValidIanaTimeZone(tzRaw) ? tzRaw : undefined;

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        planTier: PlanTier.FREE,
        termsAcceptedAt: new Date(),
        preferredLocale: mailLocale,
        ...(tzOk ? { dailyCheckTimeZone: tzOk } : {}),
        ...(state.verifiedNow
          ? { emailVerifiedAt: new Date() }
          : {
              emailVerificationTokenHash: state.tokenHash!,
              emailVerificationExpiresAt: state.expiresAt!,
              emailVerificationEmailsSent: 1,
              emailVerificationLastSentAt: new Date(),
            }),
      },
    });

    if (state.pendingEmail && state.rawToken) {
      void this.mail.sendEmailVerification(email, this.buildVerifyUrl(state.rawToken), mailLocale);
    }
    if (state.verifiedNow) {
      void this.mail.sendWelcome(user.email, mailLocale);
      return this.issueTokens(user.id, user.email);
    }
    return { verificationRequired: true as const, email: user.email };
  }

  async verifyEmail(token: string) {
    const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: { gt: new Date() },
      },
    });
    if (!user) {
      this.log.warn('verifyEmail: invalid or expired token (no matching pending verification).');
      throw new BadRequestException({
        code: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'Invalid or expired verification link.',
      });
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
        emailVerificationEmailsSent: 0,
        emailVerificationLastSentAt: null,
      },
    });
    void this.mail.sendWelcome(user.email, user.preferredLocale);
    return this.issueTokens(user.id, user.email);
  }

  async resendVerification(dto: ResendVerificationDto) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt) {
      return { ok: true as const };
    }
    const hasBrevo = !!this.config.get<string>('BREVO_API_KEY')?.trim();
    if (!hasBrevo) {
      this.log.warn('resendVerification: BREVO_API_KEY missing; cannot send');
      return { ok: true as const };
    }

    if (user.emailVerificationEmailsSent >= VERIFICATION_EMAIL_MAX_SENDS) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'RESEND_LIMIT_REACHED',
          message: 'Too many confirmation emails were sent. Try again later or contact support.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const lastSent = user.emailVerificationLastSentAt;
    if (lastSent != null) {
      const elapsed = Date.now() - lastSent.getTime();
      if (elapsed < VERIFICATION_RESEND_MIN_INTERVAL_MS) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((VERIFICATION_RESEND_MIN_INTERVAL_MS - elapsed) / 1000),
        );
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            code: 'RESEND_COOLDOWN',
            message: 'Please wait before requesting another confirmation email.',
            retryAfterSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const mailLocale = normalizeMailLocale(dto.locale ?? user.preferredLocale);
    const raw = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(raw, 'utf8').digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 3600 * 1000);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: expiresAt,
        emailVerificationEmailsSent: { increment: 1 },
        emailVerificationLastSentAt: new Date(),
        ...(dto.locale != null && String(dto.locale).trim() !== ''
          ? { preferredLocale: normalizeMailLocale(dto.locale) }
          : {}),
      },
    });
    void this.mail.sendEmailVerification(email, this.buildVerifyUrl(raw), mailLocale);
    return { ok: true as const };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    if (!user.emailVerifiedAt) {
      throw new HttpException(
        {
          statusCode: HttpStatus.UNAUTHORIZED,
          error: 'Unauthorized',
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Please confirm your e-mail before signing in.',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return this.issueTokens(user.id, user.email);
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const hasBrevo = !!this.config.get<string>('BREVO_API_KEY')?.trim();
    if (!user?.emailVerifiedAt || !hasBrevo) {
      return { ok: true as const };
    }

    const lastSent = user.passwordResetLastSentAt;
    if (lastSent != null) {
      const elapsed = Date.now() - lastSent.getTime();
      if (elapsed < PASSWORD_RESET_COOLDOWN_MS) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((PASSWORD_RESET_COOLDOWN_MS - elapsed) / 1000),
        );
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            code: 'RESET_COOLDOWN',
            message: 'Please wait before requesting another reset email.',
            retryAfterSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const raw = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(raw, 'utf8').digest('hex');
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);
    const mailLocale = normalizeMailLocale(dto.locale ?? user.preferredLocale);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: expiresAt,
        passwordResetLastSentAt: new Date(),
      },
    });
    void this.mail.sendPasswordReset(email, this.buildResetUrl(raw), mailLocale);
    return { ok: true as const };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = createHash('sha256').update(dto.token.trim(), 'utf8').digest('hex');
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { gt: new Date() },
      },
    });
    if (!user) {
      this.log.warn('resetPassword: invalid or expired token.');
      throw new BadRequestException({
        code: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'Invalid or expired reset link.',
      });
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        passwordResetLastSentAt: null,
      },
    });
    return this.issueTokens(user.id, user.email);
  }

  async updateDailyCheckSchedule(userId: string, dto: UpdateDailyCheckDto) {
    const tz = dto.dailyCheckTimeZone.trim();
    if (!isValidIanaTimeZone(tz)) {
      throw new BadRequestException({
        code: 'INVALID_TIMEZONE',
        message: 'Unknown or invalid time zone.',
      });
    }
    const normalized = normalizeLocalTimeHHmm(dto.dailyCheckLocalTime);
    if (!normalized || !parseLocalTimeHHmm(normalized)) {
      throw new BadRequestException({
        code: 'INVALID_TIME',
        message: 'Invalid daily check time (use HH:mm, 24h).',
      });
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        dailyCheckTimeZone: tz,
        dailyCheckLocalTime: normalized,
        dailyCheckLastRunDate: null,
      },
    });
    return this.getProfile(userId);
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        planTier: true,
        paypalSubscriptionId: true,
        createdAt: true,
        dailyCheckTimeZone: true,
        dailyCheckLocalTime: true,
      },
    });

    if (user.paypalSubscriptionId && user.planTier === PlanTier.PRO) {
      const active = await this.paypal.checkSubscriptionStatus(user.paypalSubscriptionId);
      if (!active) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { planTier: PlanTier.FREE, paypalSubscriptionId: null },
        });
        await this.trackings.applyPlanEmailLimits(userId, PlanTier.FREE);
        return {
          ...user,
          planTier: PlanTier.FREE,
          paypalSubscriptionId: null,
          isAdmin: user.email === ADMIN_EMAIL,
        };
      }
    }

    return { ...user, isAdmin: user.email === ADMIN_EMAIL };
  }

  private prepareVerificationState(): {
    verifiedNow: boolean;
    pendingEmail: boolean;
    rawToken: string | null;
    tokenHash: string | null;
    expiresAt: Date | null;
  } {
    const skip = this.config.get<string>('SKIP_EMAIL_VERIFICATION') === 'true';
    const hasBrevo = !!this.config.get<string>('BREVO_API_KEY')?.trim();
    const isProd = process.env.NODE_ENV === 'production';

    if (skip) {
      return { verifiedNow: true, pendingEmail: false, rawToken: null, tokenHash: null, expiresAt: null };
    }
    if (!hasBrevo) {
      if (isProd) {
        this.log.warn(
          'Registration blocked: BREVO_API_KEY is missing in production (double opt-in unavailable).',
        );
        throw new ServiceUnavailableException({
          code: 'EMAIL_VERIFICATION_UNAVAILABLE',
          message: 'Registration is temporarily unavailable (e-mail not configured).',
        });
      }
      this.log.warn('BREVO_API_KEY missing; skipping e-mail verification (non-production only).');
      return { verifiedNow: true, pendingEmail: false, rawToken: null, tokenHash: null, expiresAt: null };
    }
    const raw = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(raw, 'utf8').digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 3600 * 1000);
    return { verifiedNow: false, pendingEmail: true, rawToken: raw, tokenHash, expiresAt };
  }

  /**
   * Link target for the SPA `/verify-email` route. Must be the user-facing site, not the API.
   * Order: APP_PUBLIC_URL → UI_URL → https://SSL_PRIMARY_DOMAIN (TLS / docker-compose.ssl setups)
   * → first public origin in CORS_ORIGIN (skips localhost in production) → else first CORS entry
   * → dev fallback localhost:4200.
   */
  private buildVerifyUrl(rawToken: string): string {
    const base = this.resolvePublicAppBaseUrl();
    return `${base}/verify-email?token=${encodeURIComponent(rawToken)}`;
  }

  private buildResetUrl(rawToken: string): string {
    const base = this.resolvePublicAppBaseUrl();
    return `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
  }

  private stripTrailingSlash(url: string): string {
    return url.replace(/\/+$/, '');
  }

  private isLoopbackOrigin(url: string): boolean {
    try {
      const u = new URL(url);
      const h = u.hostname.toLowerCase();
      return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
    } catch {
      return true;
    }
  }

  private resolvePublicAppBaseUrl(): string {
    const explicit =
      this.config.get<string>('APP_PUBLIC_URL')?.trim() ||
      this.config.get<string>('UI_URL')?.trim();
    if (explicit) return this.stripTrailingSlash(explicit);

    const sslDomain =
      this.config.get<string>('SSL_PRIMARY_DOMAIN')?.trim() ||
      process.env.SSL_PRIMARY_DOMAIN?.trim();
    if (sslDomain && !sslDomain.includes('*') && !this.isLoopbackOrigin(`https://${sslDomain}`)) {
      return this.stripTrailingSlash(`https://${sslDomain}`);
    }

    const cors = this.config.get<string>('CORS_ORIGIN')?.trim();
    const origins = cors ? cors.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const isProd = process.env.NODE_ENV === 'production';

    if (origins.length > 0) {
      if (isProd) {
        const publicHttps = origins.find((o) => /^https:\/\//i.test(o) && !this.isLoopbackOrigin(o));
        if (publicHttps) return this.stripTrailingSlash(publicHttps);
        const publicHttp = origins.find((o) => /^http:\/\//i.test(o) && !this.isLoopbackOrigin(o));
        if (publicHttp) return this.stripTrailingSlash(publicHttp);
        this.log.error(
          'Production: APP_PUBLIC_URL is unset and CORS_ORIGIN has no public (non-localhost) origin. ' +
            'Verification e-mails will use the first CORS entry — set APP_PUBLIC_URL explicitly.',
        );
      }
      return this.stripTrailingSlash(origins[0]!);
    }

    if (isProd) {
      this.log.warn(
        'Verification e-mail links use http://localhost:4200 — set APP_PUBLIC_URL or SSL_PRIMARY_DOMAIN (or a public HTTPS origin in CORS_ORIGIN).',
      );
    }
    return 'http://localhost:4200';
  }

  private issueTokens(userId: string, email: string) {
    const payload = { sub: userId, email };
    return {
      access_token: this.jwt.sign(payload),
      user: { id: userId, email },
    };
  }
}
