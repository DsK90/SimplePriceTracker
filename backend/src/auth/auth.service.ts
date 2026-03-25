import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PlanTier } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PaypalService } from '../paypal/paypal.service';
import { TrackingsService } from '../trackings/trackings.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private mail: MailService,
    private paypal: PaypalService,
    private trackings: TrackingsService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        planTier: PlanTier.FREE,
      },
    });

    void this.mail.sendWelcome(user.email);

    return this.issueTokens(user.id, user.email);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

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
        };
      }
    }

    return user;
  }

  private issueTokens(userId: string, email: string) {
    const payload = { sub: userId, email };
    return {
      access_token: this.jwt.sign(payload),
      user: { id: userId, email },
    };
  }
}
