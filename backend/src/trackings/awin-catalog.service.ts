import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AwinFeedRow } from './awin-feed-csv';

@Injectable()
export class AwinCatalogService {
  constructor(private prisma: PrismaService) {}

  async search(q: string, limit = 20) {
    const trimmed = q.trim();
    if (trimmed.length < 2) return [];
    const take = Math.min(50, Math.max(1, limit));
    return this.prisma.awinCatalogProduct.findMany({
      where: { title: { contains: trimmed, mode: 'insensitive' } },
      take,
      orderBy: { title: 'asc' },
      select: {
        feedKey: true,
        title: true,
        price: true,
        currency: true,
        advertiserName: true,
        brand: true,
        imageUrl: true,
        merchantDeepLink: true,
        category: true,
      },
    });
  }

  async getByFeedKey(feedKey: string) {
    return this.prisma.awinCatalogProduct.findUnique({
      where: { feedKey: feedKey.trim() },
    });
  }

  async upsertMany(rows: AwinFeedRow[]): Promise<{ upserted: number }> {
    let upserted = 0;
    for (const r of rows) {
      await this.prisma.awinCatalogProduct.upsert({
        where: { feedKey: r.feedKey },
        create: {
          feedKey: r.feedKey,
          advertiserId: r.advertiserId,
          advertiserName: r.advertiserName,
          title: r.title,
          description: r.description,
          price: new Prisma.Decimal(r.price),
          currency: r.currency,
          merchantDeepLink: r.merchantDeepLink,
          imageUrl: r.imageUrl,
          category: r.category,
          brand: r.brand,
        },
        update: {
          advertiserId: r.advertiserId,
          advertiserName: r.advertiserName,
          title: r.title,
          description: r.description,
          price: new Prisma.Decimal(r.price),
          currency: r.currency,
          merchantDeepLink: r.merchantDeepLink,
          imageUrl: r.imageUrl,
          category: r.category,
          brand: r.brand,
        },
      });
      upserted++;
    }
    return { upserted };
  }
}
