import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanTier, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FREE_TRACKING_LIMIT, minRecheckIntervalMinutes } from '../common/constants';
import { CreateTrackingDto } from './dto/create-tracking.dto';
import { UpdateTrackingDto } from './dto/update-tracking.dto';
import { parsePriceFromText } from './price-parse';
import { extractListedPriceWithSource } from './extract-price-from-html';
import {
  extractProductAndCompany,
  fallbackProductNameFromUrl,
} from './extract-product-metadata';
import { fetchSteamProduct, parseSteamAppIdFromUrl } from './steam-store';

const TRACKING_LIST = Prisma.validator<Prisma.PriceTrackingDefaultArgs>()({
  include: { snapshots: { orderBy: { recordedAt: 'desc' }, take: 30 } },
});

type TrackingRow = Prisma.PriceTrackingGetPayload<typeof TRACKING_LIST>;

export type PublicTracking = TrackingRow & {
  displayProductName: string;
  displayCompanyName: string | null;
};

@Injectable()
export class TrackingsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private config: ConfigService,
  ) {}

  private clampIntervalMinutes(n: number): number {
    const min = minRecheckIntervalMinutes(this.config.get<string>('NODE_ENV'));
    return Math.min(10080, Math.max(min, Math.round(n)));
  }

  private toPublicTracking(t: TrackingRow): PublicTracking {
    return {
      ...t,
      displayProductName: t.productNameOverride ?? t.productName,
      displayCompanyName: t.companyNameOverride ?? t.companyName,
    };
  }

  list(userId: string) {
    return this.prisma.priceTracking
      .findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        ...TRACKING_LIST,
      })
      .then((rows) => rows.map((t) => this.toPublicTracking(t)));
  }

  async create(userId: string, dto: CreateTrackingDto) {
    const active = dto.active !== false;
    if (active) await this.assertCanAddActive(userId);
    const currency = dto.currency ?? 'EUR';
    const interval = dto.recheckIntervalMinutes
      ? this.clampIntervalMinutes(dto.recheckIntervalMinutes)
      : 360;
    const alertBelow =
      dto.alertBelowPrice !== undefined && dto.alertBelowPrice !== null
        ? new Prisma.Decimal(dto.alertBelowPrice)
        : null;
    const alertAbove =
      dto.alertAbovePrice !== undefined && dto.alertAbovePrice !== null
        ? new Prisma.Decimal(dto.alertAbovePrice)
        : null;

    const steamAppId = parseSteamAppIdFromUrl(dto.url);
    if (steamAppId) {
      const steam = await fetchSteamProduct(steamAppId, currency);
      if (!steam) {
        throw new BadRequestException('Could not load this Steam product or price.');
      }
      return this.createWithInitialPrice(userId, {
        url: dto.url,
        productName: steam.name,
        companyName: 'Steam',
        price: steam.price,
        currency: steam.currency,
        active,
        recheckIntervalMinutes: interval,
        alertBelowPrice: alertBelow,
        alertAbovePrice: alertAbove,
      });
    }

    const html = await this.fetchHtml(dto.url);
    const { raw } = extractListedPriceWithSource(html);
    const meta = extractProductAndCompany(html, dto.url);
    if (!raw) {
      throw new BadRequestException(
        'Could not find a price on this page. The shop may block bots or need JavaScript.',
      );
    }
    const num = parsePriceFromText(raw);
    if (num === null) {
      throw new BadRequestException(`Could not parse price from: ${raw.slice(0, 80)}`);
    }

    const productName = meta.productName ?? fallbackProductNameFromUrl(dto.url);
    return this.createWithInitialPrice(userId, {
      url: dto.url,
      productName,
      companyName: meta.companyName ?? null,
      price: num,
      currency,
      active,
      recheckIntervalMinutes: interval,
      alertBelowPrice: alertBelow,
      alertAbovePrice: alertAbove,
    });
  }

  private async createWithInitialPrice(
    userId: string,
    args: {
      url: string;
      productName: string;
      companyName: string | null;
      price: number;
      currency: string;
      active: boolean;
      recheckIntervalMinutes: number;
      alertBelowPrice: Prisma.Decimal | null;
      alertAbovePrice: Prisma.Decimal | null;
    },
  ) {
    const dec = new Prisma.Decimal(args.price);
    const row = await this.prisma.priceTracking.create({
      data: {
        userId,
        url: args.url,
        productName: args.productName,
        companyName: args.companyName,
        recheckIntervalMinutes: args.recheckIntervalMinutes,
        alertBelowPrice: args.alertBelowPrice,
        alertAbovePrice: args.alertAbovePrice,
        lastPrice: dec,
        currency: args.currency,
        lastCheckedAt: new Date(),
        active: args.active,
        snapshots: {
          create: { price: dec, currency: args.currency },
        },
      },
      ...TRACKING_LIST,
    });
    return this.toPublicTracking(row);
  }

  async update(userId: string, id: string, dto: UpdateTrackingDto): Promise<PublicTracking> {
    const existing = await this.prisma.priceTracking.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException();

    if (dto.active === true && !existing.active) {
      await this.assertCanAddActive(userId);
    }

    if (dto.url !== undefined && dto.url !== existing.url) {
      await this.resyncTracking(userId, id, dto.url, dto.currency ?? existing.currency, dto.active);
      const { url: _url, ...rest } = dto;
      const hasMore =
        rest.currency !== undefined ||
        rest.active !== undefined ||
        rest.recheckIntervalMinutes !== undefined ||
        rest.productNameOverride !== undefined ||
        rest.companyNameOverride !== undefined ||
        rest.alertBelowPrice !== undefined ||
        rest.alertAbovePrice !== undefined;
      if (hasMore) {
        return this.update(userId, id, rest);
      }
      const row = await this.prisma.priceTracking.findFirst({
        where: { id, userId },
        ...TRACKING_LIST,
      });
      if (!row) throw new NotFoundException();
      return this.toPublicTracking(row);
    }

    const data: Prisma.PriceTrackingUpdateInput = {};
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.recheckIntervalMinutes !== undefined) {
      data.recheckIntervalMinutes = this.clampIntervalMinutes(dto.recheckIntervalMinutes);
    }
    if (dto.productNameOverride !== undefined) {
      const v = dto.productNameOverride;
      data.productNameOverride = v === null || (typeof v === 'string' && v.trim() === '') ? null : v.trim();
    }
    if (dto.companyNameOverride !== undefined) {
      const v = dto.companyNameOverride;
      data.companyNameOverride = v === null || (typeof v === 'string' && v.trim() === '') ? null : v.trim();
    }
    if (dto.alertBelowPrice !== undefined) {
      data.alertBelowPrice =
        dto.alertBelowPrice === null ? null : new Prisma.Decimal(dto.alertBelowPrice);
    }
    if (dto.alertAbovePrice !== undefined) {
      data.alertAbovePrice =
        dto.alertAbovePrice === null ? null : new Prisma.Decimal(dto.alertAbovePrice);
    }

    const row = await this.prisma.priceTracking.update({
      where: { id },
      data,
      ...TRACKING_LIST,
    });
    return this.toPublicTracking(row);
  }

  /** Re-fetch URL: same logic as create (new product metadata + price). */
  private async resyncTracking(
    userId: string,
    id: string,
    url: string,
    currency: string,
    active?: boolean,
  ) {
    const existing = await this.prisma.priceTracking.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException();
    if (active === true && !existing.active) await this.assertCanAddActive(userId);

    const steamAppId = parseSteamAppIdFromUrl(url);
    if (steamAppId) {
      const steam = await fetchSteamProduct(steamAppId, currency);
      if (!steam) throw new BadRequestException('Could not load this Steam product or price.');
      const dec = new Prisma.Decimal(steam.price);
      const row = await this.prisma.priceTracking.update({
        where: { id },
        data: {
          url,
          productName: steam.name,
          companyName: 'Steam',
          lastPrice: dec,
          currency: steam.currency,
          lastCheckedAt: new Date(),
          ...(active !== undefined ? { active } : {}),
          snapshots: { create: { price: dec, currency: steam.currency } },
        },
        ...TRACKING_LIST,
      });
      return this.toPublicTracking(row);
    }

    const html = await this.fetchHtml(url);
    const { raw } = extractListedPriceWithSource(html);
    const meta = extractProductAndCompany(html, url);
    if (!raw) {
      throw new BadRequestException(
        'Could not find a price on this page. The shop may block bots or need JavaScript.',
      );
    }
    const num = parsePriceFromText(raw);
    if (num === null) {
      throw new BadRequestException(`Could not parse price from: ${raw.slice(0, 80)}`);
    }
    const dec = new Prisma.Decimal(num);
    const productName = meta.productName ?? fallbackProductNameFromUrl(url);
    const row = await this.prisma.priceTracking.update({
      where: { id },
      data: {
        url,
        productName,
        companyName: meta.companyName ?? null,
        lastPrice: dec,
        currency,
        lastCheckedAt: new Date(),
        ...(active !== undefined ? { active } : {}),
        snapshots: { create: { price: dec, currency } },
      },
      ...TRACKING_LIST,
    });
    return this.toPublicTracking(row);
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.priceTracking.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException();
    await this.prisma.priceTracking.delete({ where: { id } });
    return { ok: true };
  }

  async refresh(userId: string, id: string) {
    const t = await this.prisma.priceTracking.findFirst({ where: { id, userId } });
    if (!t) throw new NotFoundException();
    const row = await this.refreshOneInternal(t.id);
    return this.toPublicTracking(row);
  }

  /** Cron: refresh every active tracking whose interval has elapsed */
  async refreshDueTrackings() {
    const due = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "PriceTracking"
      WHERE "active" = true
      AND (
        "lastCheckedAt" IS NULL OR
        "lastCheckedAt" <= NOW() - ("recheckIntervalMinutes" * INTERVAL '1 minute')
      )
    `;
    for (const { id } of due) {
      try {
        await this.refreshOneInternal(id);
      } catch {
        /* ignore single failures */
      }
    }
  }

  /** Legacy: refresh all active (heavy); prefer refreshDueTrackings */
  async refreshAllActive() {
    const ids = await this.prisma.priceTracking.findMany({
      where: { active: true },
      select: { id: true },
    });
    for (const { id } of ids) {
      try {
        await this.refreshOneInternal(id);
      } catch {
        /* ignore */
      }
    }
  }

  private async refreshOneInternal(id: string): Promise<TrackingRow> {
    const t = await this.prisma.priceTracking.findUniqueOrThrow({ where: { id } });

    const steamAppId = parseSteamAppIdFromUrl(t.url);
    if (steamAppId) {
      const steam = await fetchSteamProduct(steamAppId, t.currency);
      if (steam) {
        return this.persistPrice(id, steam.price, steam.currency, {
          productName: steam.name,
          companyName: 'Steam',
        });
      }
    }

    const html = await this.fetchHtml(t.url);
    const meta = extractProductAndCompany(html, t.url);
    const { raw } = extractListedPriceWithSource(html);
    if (!raw) {
      throw new BadRequestException(
        'Could not find a price on this page. The shop may block bots or need JavaScript.',
      );
    }
    const num = parsePriceFromText(raw);
    if (num === null) {
      throw new BadRequestException(`Could not parse price from: ${raw.slice(0, 80)}`);
    }

    return this.persistPrice(id, num, t.currency, {
      productName: meta.productName ?? undefined,
      companyName: meta.companyName,
    });
  }

  private async maybeNotifyPriceThresholds(
    before: {
      id: string;
      userId: string;
      lastPrice: Prisma.Decimal | null;
      alertBelowPrice: Prisma.Decimal | null;
      alertAbovePrice: Prisma.Decimal | null;
      productName: string;
      productNameOverride: string | null;
    },
    userEmail: string,
    newPrice: number,
    currency: string,
  ) {
    const np = new Prisma.Decimal(newPrice);
    const lp = before.lastPrice;
    const label = (before.productNameOverride ?? before.productName).slice(0, 120);

    if (before.alertBelowPrice != null) {
      const th = before.alertBelowPrice;
      const wasAbove = lp === null || lp.gt(th);
      const nowAtOrBelow = np.lte(th);
      if (wasAbove && nowAtOrBelow) {
        await this.notifications.notifyPriceAlert(
          before.userId,
          userEmail,
          before.id,
          `Price at or below ${th.toString()} ${currency}`,
          `${label} is now ${np.toString()} ${currency} (target: ≤ ${th.toString()} ${currency}).`,
        );
      }
    }

    if (before.alertAbovePrice != null) {
      const th = before.alertAbovePrice;
      const wasBelow = lp === null || lp.lt(th);
      const nowAtOrAbove = np.gte(th);
      if (wasBelow && nowAtOrAbove) {
        await this.notifications.notifyPriceAlert(
          before.userId,
          userEmail,
          before.id,
          `Price at or above ${th.toString()} ${currency}`,
          `${label} is now ${np.toString()} ${currency} (target: ≥ ${th.toString()} ${currency}).`,
        );
      }
    }
  }

  private async persistPrice(
    id: string,
    num: number,
    currency: string,
    meta?: { productName?: string | null; companyName?: string | null },
  ): Promise<TrackingRow> {
    const before = await this.prisma.priceTracking.findUniqueOrThrow({
      where: { id },
      include: { user: { select: { email: true } } },
    });

    const dec = new Prisma.Decimal(num);
    const data: Prisma.PriceTrackingUpdateInput = {
      lastPrice: dec,
      currency,
      lastCheckedAt: new Date(),
    };
    if (meta?.productName) data.productName = meta.productName;
    if (meta && 'companyName' in meta) data.companyName = meta.companyName;

    await this.prisma.$transaction([
      this.prisma.priceTracking.update({ where: { id }, data }),
      this.prisma.priceSnapshot.create({
        data: { trackingId: id, price: dec, currency },
      }),
    ]);

    await this.maybeNotifyPriceThresholds(
      {
        id: before.id,
        userId: before.userId,
        lastPrice: before.lastPrice,
        alertBelowPrice: before.alertBelowPrice,
        alertAbovePrice: before.alertAbovePrice,
        productName: before.productName,
        productNameOverride: before.productNameOverride,
      },
      before.user.email,
      num,
      currency,
    );

    return this.prisma.priceTracking.findUniqueOrThrow({
      where: { id },
      ...TRACKING_LIST,
    });
  }

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw new BadRequestException(`HTTP ${res.status} fetching page`);
    return res.text();
  }

  private async assertCanAddActive(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    if (user.planTier === PlanTier.PRO) return;

    const count = await this.prisma.priceTracking.count({
      where: { userId, active: true },
    });
    if (count >= FREE_TRACKING_LIMIT) {
      throw new ForbiddenException(
        `Free plan allows up to ${FREE_TRACKING_LIMIT} active trackings. Upgrade for more.`,
      );
    }
  }
}
