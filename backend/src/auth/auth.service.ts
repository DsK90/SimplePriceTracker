import {
  BadRequestException,
  ConflictException,
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
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PaypalService } from '../paypal/paypal.service';
import { TrackingsService } from '../trackings/trackings.service';

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
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const state = this.prepareVerificationState();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing?.emailVerifiedAt) {
      throw new ConflictException('Email already registered');
    }

    if (existing) {
      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          termsAcceptedAt: new Date(),
          ...(state.verifiedNow
            ? {
                emailVerifiedAt: new Date(),
                emailVerificationTokenHash: null,
                emailVerificationExpiresAt: null,
              }
            : {
                emailVerifiedAt: null,
                emailVerificationTokenHash: state.tokenHash!,
                emailVerificationExpiresAt: state.expiresAt!,
              }),
        },
      });
      if (state.pendingEmail && state.rawToken) {
        void this.mail.sendEmailVerification(email, this.buildVerifyUrl(state.rawToken));
      }
      if (state.verifiedNow) {
        void this.mail.sendWelcome(email);
        return this.issueTokens(existing.id, email);
      }
      return { verificationRequired: true as const, email };
    }

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        planTier: PlanTier.FREE,
        termsAcceptedAt: new Date(),
        ...(state.verifiedNow
          ? { emailVerifiedAt: new Date() }
          : {
              emailVerificationTokenHash: state.tokenHash!,
              emailVerificationExpiresAt: state.expiresAt!,
            }),
      },
    });

    if (state.pendingEmail && state.rawToken) {
      void this.mail.sendEmailVerification(email, this.buildVerifyUrl(state.rawToken));
    }
    if (state.verifiedNow) {
      void this.mail.sendWelcome(user.email);
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
      },
    });
    void this.mail.sendWelcome(user.email);
    return this.issueTokens(user.id, user.email);
  }

  async resendVerification(emailRaw: string) {
    const email = emailRaw.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt) {
      return { ok: true as const };
    }
    const hasBrevo = !!this.config.get<string>('BREVO_API_KEY')?.trim();
    if (!hasBrevo) {
      this.log.warn('resendVerification: BREVO_API_KEY missing; cannot send');
      return { ok: true as const };
    }
    const raw = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(raw, 'utf8').digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 3600 * 1000);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationTokenHash: tokenHash, emailVerificationExpiresAt: expiresAt },
    });
    void this.mail.sendEmailVerification(email, this.buildVerifyUrl(raw));
    return { ok: true as const };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please confirm your e-mail before signing in.',
      });
    }

    return this.issueTokens(user.id, user.email);
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

  private buildVerifyUrl(rawToken: string): string {
    const base =
      this.config.get<string>('APP_PUBLIC_URL')?.trim() ||
      this.config.get<string>('UI_URL')?.trim() ||
      'http://localhost:4200';
    const u = base.replace(/\/$/, '');
    return `${u}/verify-email?token=${encodeURIComponent(rawToken)}`;
  }

  private issueTokens(userId: string, email: string) {
    const payload = { sub: userId, email };
    return {
      access_token: this.jwt.sign(payload),
      user: { id: userId, email },
    };
  }
}
