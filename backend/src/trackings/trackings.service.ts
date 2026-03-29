import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlanTier, Prisma, PriceTracking } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildPriceAlertMessages } from '../notifications/price-alert-messages';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ADMIN_EMAIL,
  emailAlertSlotsForPlan,
  FREE_TRACKING_LIMIT,
  minRecheckIntervalMinutes,
} from '../common/constants';
import { CreateTrackingDto } from './dto/create-tracking.dto';
import { UpdateTrackingDto } from './dto/update-tracking.dto';
import { AwinCatalogService } from './awin-catalog.service';

/** Synthetic URL for dev-only demo tracking (price adjusted via API, not scraped). */
const DEMO_URL = 'demo://price-test';

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
  private readonly log = new Logger(TrackingsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private config: ConfigService,
    private awinCatalog: AwinCatalogService,
  ) {}

  searchCatalog(q: string, limit: number) {
    return this.awinCatalog.search(q, limit);
  }

  private clampIntervalMinutes(n: number): number {
    const min = minRecheckIntervalMinutes(this.config.get<string>('NODE_ENV'));
    return Math.min(10080, Math.max(min, Math.round(n)));
  }

  /** Dev/staging only unless ENABLE_DEMO_PRICE=true (never in production by default). */
  private isDemoPriceApiEnabled(): boolean {
    const env = this.config.get<string>('NODE_ENV');
    const enable = this.config.get<string>('ENABLE_DEMO_PRICE');
    return env !== 'production' || enable === 'true';
  }

  private assertDemoPriceApi(): void {
    if (!this.isDemoPriceApiEnabled()) {
      throw new ForbiddenException('Demo price API is disabled');
    }
  }

  private decimalEquals(a: Prisma.Decimal | null, b: Prisma.Decimal | null): boolean {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    return a.equals(b);
  }

  /** When user saves new thresholds and current price already satisfies them, notify once (not only on next price refresh crossing). */
  private async maybeNotifyImmediateThresholdsAfterPatch(
    before: {
      id: string;
      userId: string;
      productName: string;
      productNameOverride: string | null;
      lastPrice: Prisma.Decimal | null;
      currency: string;
      alertBelowPrice: Prisma.Decimal | null;
      alertAbovePrice: Prisma.Decimal | null;
    },
    after: PriceTracking & { user: { email: string } },
    dto: UpdateTrackingDto,
  ): Promise<void> {
    const lp = after.lastPrice;
    if (lp === null) return;

    const label = (after.productNameOverride ?? after.productName).slice(0, 120);
    const email = after.user.email;

    if (dto.alertBelowPrice !== undefined) {
      const changed = !this.decimalEquals(before.alertBelowPrice, after.alertBelowPrice);
      if (changed && after.alertBelowPrice != null) {
        const th = after.alertBelowPrice;
        if (lp.lte(th)) {
          const { titleEn, bodyEn, payload } = buildPriceAlertMessages(
            'below',
            th,
            after.currency,
            label,
            lp,
          );
          await this.notifications.notifyPriceAlert(after.userId, email, after.id, titleEn, bodyEn, {
            sendEmail: after.emailAlertsEnabled,
            payload,
          });
        }
      }
    }

    if (dto.alertAbovePrice !== undefined) {
      const changed = !this.decimalEquals(before.alertAbovePrice, after.alertAbovePrice);
      if (changed && after.alertAbovePrice != null) {
        const th = after.alertAbovePrice;
        if (lp.gte(th)) {
          const { titleEn, bodyEn, payload } = buildPriceAlertMessages(
            'above',
            th,
            after.currency,
            label,
            lp,
          );
          await this.notifications.notifyPriceAlert(after.userId, email, after.id, titleEn, bodyEn, {
            sendEmail: after.emailAlertsEnabled,
            payload,
          });
        }
      }
    }
  }

  private toPublicTracking(t: TrackingRow): PublicTracking {
    return {
      ...t,
      displayProductName: t.productNameOverride ?? t.productName,
      displayCompanyName: t.companyNameOverride ?? t.companyName,
    };
  }

  /**
   * Pro: up to 30 snapshots (history dialog). Free: only last 2 in the JSON response (enough for % delta).
   * Always use fixed `take: 30` in the query — Prisma 7 + pg can fail with a variable nested `take`
   * (“column (not available) does not exist”); trimming in memory avoids that.
   */
  async list(userId: string): Promise<PublicTracking[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { planTier: true, email: true },
    });
    const rows = await this.prisma.priceTracking.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      ...TRACKING_LIST,
    });
    const mapped = rows.map((t) => this.toPublicTracking(t));
    if (user?.planTier === PlanTier.PRO || user?.email === ADMIN_EMAIL) return mapped;
    return mapped.map((t) => ({
      ...t,
      snapshots: (t.snapshots ?? []).slice(0, 2),
    }));
  }

  async create(userId: string, dto: CreateTrackingDto) {
    const active = dto.active !== false;
    if (active) await this.assertCanAddActive(userId);
    if (dto.emailAlertsEnabled === true) {
      await this.assertEmailAlertSlotsAvailable(userId);
    }
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

    const key = dto.awinFeedKey.trim();
    const product = await this.awinCatalog.getByFeedKey(key);
    if (!product) {
      throw new BadRequestException({
        code: 'AWIN_PRODUCT_NOT_IN_CATALOG',
        message:
          'Product not in catalog. Import an Awin feed (camera/tech niche) and try again, or pick from search results.',
      });
    }
    const price = Number(product.price);
    return this.createWithInitialPrice(userId, {
      awinFeedKey: product.feedKey,
      url: product.merchantDeepLink,
      productName: product.title,
      companyName: product.advertiserName ?? null,
      price,
      currency: product.currency || currency,
      active,
      recheckIntervalMinutes: interval,
      alertBelowPrice: alertBelow,
      alertAbovePrice: alertAbove,
      emailAlertsEnabled: dto.emailAlertsEnabled === true,
    });
  }

  /** New trackings appear at the top of the list (same as previous “newest first” behavior). */
  private async nextSortOrderForNew(userId: string): Promise<number> {
    const agg = await this.prisma.priceTracking.aggregate({
      where: { userId },
      _min: { sortOrder: true },
    });
    const min = agg._min.sortOrder;
    if (min === null) return 0;
    return min - 1;
  }

  async reorder(userId: string, ids: string[]): Promise<{ ok: true }> {
    const existing = await this.prisma.priceTracking.findMany({
      where: { userId },
      select: { id: true },
    });
    if (existing.length !== ids.length) {
      throw new BadRequestException('Reorder must include every tracking exactly once');
    }
    const set = new Set(existing.map((x) => x.id));
    const seen = new Set<string>();
    for (const id of ids) {
      if (!set.has(id)) {
        throw new BadRequestException('Invalid tracking id in reorder list');
      }
      if (seen.has(id)) {
        throw new BadRequestException('Duplicate id in reorder list');
      }
      seen.add(id);
    }
    await this.prisma.$transaction(
      ids.map((id, i) =>
        this.prisma.priceTracking.update({
          where: { id, userId },
          data: { sortOrder: i },
        }),
      ),
    );
    return { ok: true };
  }

  private async createWithInitialPrice(
    userId: string,
    args: {
      awinFeedKey?: string | null;
      url: string;
      productName: string;
      companyName: string | null;
      price: number;
      currency: string;
      active: boolean;
      recheckIntervalMinutes: number;
      alertBelowPrice: Prisma.Decimal | null;
      alertAbovePrice: Prisma.Decimal | null;
      emailAlertsEnabled?: boolean;
    },
  ) {
    const dec = new Prisma.Decimal(args.price);
    const sortOrder = await this.nextSortOrderForNew(userId);
    const row = await this.prisma.priceTracking.create({
      data: {
        userId,
        awinFeedKey: args.awinFeedKey ?? null,
        url: args.url,
        productName: args.productName,
        companyName: args.companyName,
        recheckIntervalMinutes: args.recheckIntervalMinutes,
        alertBelowPrice: args.alertBelowPrice,
        alertAbovePrice: args.alertAbovePrice,
        emailAlertsEnabled: args.emailAlertsEnabled ?? false,
        lastPrice: dec,
        currency: args.currency,
        lastCheckedAt: new Date(),
        active: args.active,
        sortOrder,
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

    if (
      dto.awinFeedKey !== undefined &&
      dto.awinFeedKey.trim() !== (existing.awinFeedKey ?? '').trim()
    ) {
      const nk = dto.awinFeedKey.trim();
      const product = await this.awinCatalog.getByFeedKey(nk);
      if (!product) {
        throw new BadRequestException({
          code: 'AWIN_PRODUCT_NOT_IN_CATALOG',
          message: 'Product not in catalog.',
        });
      }
      const price = Number(product.price);
      const dec = new Prisma.Decimal(price);
      const cur = dto.currency ?? existing.currency;
      const row = await this.prisma.priceTracking.update({
        where: { id },
        data: {
          awinFeedKey: product.feedKey,
          url: product.merchantDeepLink,
          productName: product.title,
          companyName: product.advertiserName ?? null,
          lastPrice: dec,
          currency: product.currency || cur,
          lastCheckedAt: new Date(),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
          snapshots: { create: { price: dec, currency: product.currency || cur } },
        },
        ...TRACKING_LIST,
      });
      const { awinFeedKey: _a, ...rest } = dto;
      const hasMore =
        rest.currency !== undefined ||
        rest.active !== undefined ||
        rest.recheckIntervalMinutes !== undefined ||
        rest.productNameOverride !== undefined ||
        rest.companyNameOverride !== undefined ||
        rest.alertBelowPrice !== undefined ||
        rest.alertAbovePrice !== undefined ||
        rest.emailAlertsEnabled !== undefined;
      if (hasMore) {
        return this.update(userId, id, rest);
      }
      return this.toPublicTracking(row);
    }

    if (dto.emailAlertsEnabled === true && !existing.emailAlertsEnabled) {
      await this.assertEmailAlertSlotsAvailable(userId, id);
    }

    const data: Prisma.PriceTrackingUpdateInput = {};
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.emailAlertsEnabled !== undefined) data.emailAlertsEnabled = dto.emailAlertsEnabled;
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

    if (dto.alertBelowPrice !== undefined || dto.alertAbovePrice !== undefined) {
      const afterWithUser = await this.prisma.priceTracking.findUniqueOrThrow({
        where: { id },
        include: { user: { select: { email: true } } },
      });
      await this.maybeNotifyImmediateThresholdsAfterPatch(existing, afterWithUser, dto);
    }

    return this.toPublicTracking(row);
  }

  async remove(userId: string, id: string) {
    const existing = await this.prisma.priceTracking.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException();
    await this.prisma.priceTracking.delete({ where: { id } });
    return { ok: true };
  }

  /** Dev: one synthetic tracking per user to test price alerts without scraping. */
  async createDemo(userId: string): Promise<PublicTracking> {
    this.assertDemoPriceApi();
    const existing = await this.prisma.priceTracking.findFirst({
      where: { userId, url: DEMO_URL },
    });
    if (existing) {
      return this.toPublicTracking(
        await this.prisma.priceTracking.findUniqueOrThrow({
          where: { id: existing.id },
          ...TRACKING_LIST,
        }),
      );
    }
    await this.assertCanAddActive(userId);
    const dec50 = new Prisma.Decimal(50);
    const sortOrder = await this.nextSortOrderForNew(userId);
    const row = await this.prisma.priceTracking.create({
      data: {
        userId,
        url: DEMO_URL,
        productName: 'Demo product',
        companyName: 'Pricefly',
        recheckIntervalMinutes: 60,
        lastPrice: dec50,
        currency: 'EUR',
        lastCheckedAt: new Date(),
        active: true,
        sortOrder,
        snapshots: { create: { price: dec50, currency: 'EUR' } },
      },
      ...TRACKING_LIST,
    });
    return this.toPublicTracking(row);
  }

  /** Dev: nudge demo price up/down to trigger threshold notifications. */
  async adjustDemoPrice(userId: string, id: string, delta: number): Promise<PublicTracking> {
    this.assertDemoPriceApi();
    const t = await this.prisma.priceTracking.findFirst({ where: { id, userId } });
    if (!t) throw new NotFoundException();
    if (!t.url.startsWith('demo://')) {
      throw new BadRequestException('Only demo trackings support demo price changes');
    }
    const lp = t.lastPrice ? Number(t.lastPrice) : 50;
    const next = Math.round((lp + delta) * 100) / 100;
    if (next < 0) throw new BadRequestException('Price cannot be negative');
    const row = await this.persistPrice(id, next, t.currency);
    return this.toPublicTracking(row);
  }

  /**
   * Admin-only: seed 5 showcase trackings with price history
   * demonstrating price drops, increases, and stable prices.
   */
  async seedShowcaseProducts(userId: string, email: string): Promise<PublicTracking[]> {
    if (email !== ADMIN_EMAIL) {
      throw new ForbiddenException('Showcase products are admin-only');
    }

    const existing = await this.prisma.priceTracking.findMany({
      where: { userId, url: { startsWith: 'demo://showcase' } },
    });
    if (existing.length > 0) {
      await this.prisma.priceSnapshot.deleteMany({
        where: { trackingId: { in: existing.map((e) => e.id) } },
      });
      await this.prisma.priceTracking.deleteMany({
        where: { id: { in: existing.map((e) => e.id) } },
      });
    }

    const now = new Date();
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

    const showcases: {
      url: string;
      productName: string;
      companyName: string;
      prices: number[];
    }[] = [
      {
        url: 'demo://showcase-1',
        productName: 'Sony Alpha 7 IV Gehäuse',
        companyName: 'Fachhändler (Beispiel)',
        prices: [2199, 2149, 2099, 2049, 1999, 1949],
      },
      {
        url: 'demo://showcase-2',
        productName: 'Canon EOS R6 Mark II',
        companyName: 'Calumet (Beispiel)',
        prices: [2499, 2449, 2399, 2399, 2349, 2299],
      },
      {
        url: 'demo://showcase-3',
        productName: 'Fujifilm X-T5 Body',
        companyName: 'Foto Erhardt (Beispiel)',
        prices: [1699, 1729, 1749, 1699, 1649, 1599],
      },
      {
        url: 'demo://showcase-4',
        productName: 'DJI Mini 4 Pro Fly More',
        companyName: 'Cyberport (Beispiel)',
        prices: [999, 979, 959, 949, 929, 899],
      },
      {
        url: 'demo://showcase-5',
        productName: 'Sigma 24-70mm F2.8 DG DN',
        companyName: 'Alternate (Beispiel)',
        prices: [1099, 1099, 1099, 1099, 1099, 1099],
      },
    ];

    const results: PublicTracking[] = [];
    let sortOrder = await this.nextSortOrderForNew(userId);

    for (const s of showcases) {
      const lastPrice = s.prices[s.prices.length - 1];
      const snapshots = s.prices.map((price, i) => ({
        price: new Prisma.Decimal(price),
        currency: 'EUR',
        recordedAt: hoursAgo((s.prices.length - 1 - i) * 24),
      }));

      const row = await this.prisma.priceTracking.create({
        data: {
          userId,
          url: s.url,
          productName: s.productName,
          companyName: s.companyName,
          recheckIntervalMinutes: 1440,
          lastPrice: new Prisma.Decimal(lastPrice),
          currency: 'EUR',
          lastCheckedAt: now,
          active: false,
          sortOrder: sortOrder--,
          snapshots: { create: snapshots },
        },
        ...TRACKING_LIST,
      });
      results.push(this.toPublicTracking(row));
    }

    return results;
  }

  async refresh(userId: string, id: string) {
    const t = await this.prisma.priceTracking.findFirst({ where: { id, userId } });
    if (!t) throw new NotFoundException();
    if (!t.url.startsWith('demo://') && !t.awinFeedKey) {
      throw new BadRequestException({
        code: 'LEGACY_NO_AWINSYNC',
        message:
          'This item is from the old URL-based tracker. Remove it and add the product again from the Awin catalog.',
      });
    }
    const row = await this.refreshOneInternal(t.id);
    return this.toPublicTracking(row);
  }

  /** Cron: refresh every active tracking whose interval has elapsed */
  async refreshDueTrackings() {
    const due = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "PriceTracking"
      WHERE "active" = true
      AND "awinFeedKey" IS NOT NULL
      AND url NOT LIKE 'demo://%'
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
      where: {
        active: true,
        awinFeedKey: { not: null },
        NOT: { url: { startsWith: 'demo://' } },
      },
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

    if (t.url.startsWith('demo://')) {
      return this.prisma.priceTracking.findUniqueOrThrow({
        where: { id },
        ...TRACKING_LIST,
      });
    }

    if (t.awinFeedKey) {
      const p = await this.awinCatalog.getByFeedKey(t.awinFeedKey);
      if (!p) {
        this.log.warn(`Awin catalog miss for tracking ${id} (${t.awinFeedKey}) — re-import feed`);
        await this.prisma.priceTracking.update({
          where: { id },
          data: { lastCheckedAt: new Date() },
        });
        return this.prisma.priceTracking.findUniqueOrThrow({
          where: { id },
          ...TRACKING_LIST,
        });
      }
      const cur = p.currency || t.currency;
      return this.persistPrice(id, Number(p.price), cur, {
        productName: p.title,
        companyName: p.advertiserName,
      });
    }

    await this.prisma.priceTracking.update({
      where: { id },
      data: { lastCheckedAt: new Date() },
    });
    return this.prisma.priceTracking.findUniqueOrThrow({
      where: { id },
      ...TRACKING_LIST,
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
      emailAlertsEnabled: boolean;
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
        const { titleEn, bodyEn, payload } = buildPriceAlertMessages('below', th, currency, label, np);
        await this.notifications.notifyPriceAlert(before.userId, userEmail, before.id, titleEn, bodyEn, {
          sendEmail: before.emailAlertsEnabled,
          payload,
        });
      }
    }

    if (before.alertAbovePrice != null) {
      const th = before.alertAbovePrice;
      const wasBelow = lp === null || lp.lt(th);
      const nowAtOrAbove = np.gte(th);
      if (wasBelow && nowAtOrAbove) {
        const { titleEn, bodyEn, payload } = buildPriceAlertMessages('above', th, currency, label, np);
        await this.notifications.notifyPriceAlert(before.userId, userEmail, before.id, titleEn, bodyEn, {
          sendEmail: before.emailAlertsEnabled,
          payload,
        });
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
        emailAlertsEnabled: before.emailAlertsEnabled,
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

  private async assertCanAddActive(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    if (user.email === ADMIN_EMAIL) return;
    if (user.planTier === PlanTier.PRO) return;

    const count = await this.prisma.priceTracking.count({
      where: { userId, active: true },
    });
    if (count >= FREE_TRACKING_LIMIT) {
      throw new ForbiddenException({
        code: 'FREE_TRACKING_LIMIT',
        limit: FREE_TRACKING_LIMIT,
      });
    }
  }

  /** Enforce max products with email alerts per plan (2 free, 10 Pro). */
  private async assertEmailAlertSlotsAvailable(userId: string, excludeTrackingId?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    if (user.email === ADMIN_EMAIL) return;
    const limit = emailAlertSlotsForPlan(user.planTier);
    const count = await this.prisma.priceTracking.count({
      where: {
        userId,
        emailAlertsEnabled: true,
        ...(excludeTrackingId ? { id: { not: excludeTrackingId } } : {}),
      },
    });
    if (count >= limit) {
      throw new ForbiddenException({
        code: 'EMAIL_ALERT_LIMIT',
        limit,
      });
    }
  }

  /** After downgrade to Free, disable email on oldest excess trackings (keep first N by createdAt). */
  async applyPlanEmailLimits(userId: string, planTier: PlanTier): Promise<void> {
    const limit = emailAlertSlotsForPlan(planTier);
    const rows = await this.prisma.priceTracking.findMany({
      where: { userId, emailAlertsEnabled: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const overflow = rows.slice(limit);
    if (overflow.length === 0) return;
    await this.prisma.priceTracking.updateMany({
      where: { id: { in: overflow.map((r) => r.id) } },
      data: { emailAlertsEnabled: false },
    });
  }
}
