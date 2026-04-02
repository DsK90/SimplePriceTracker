import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { AwinCatalogService } from './awin-catalog.service';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: AwinCatalogService) {}

  @Get('search')
  search(
    @Query('q') q: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('techOnly') techOnly?: string,
    @Query('advertiser') advertiser?: string,
  ) {
    const n = limit ? Number.parseInt(limit, 10) : 20;
    const off = offset ? Number.parseInt(offset, 10) : 0;
    return this.catalog.search(q ?? '', {
      limit: Number.isFinite(n) ? n : 20,
      offset: Number.isFinite(off) ? off : 0,
      techOnly: techOnly === '1' || techOnly === 'true',
      advertiser: advertiser?.trim() || undefined,
    });
  }

  @Get('stats')
  stats() {
    return this.catalog.count().then((productCount) => ({ productCount }));
  }

  @Get('product/:feedKey')
  async product(@Param('feedKey') feedKey: string) {
    const key = decodeURIComponent(feedKey ?? '').trim();
    const p = await this.catalog.getByFeedKey(key);
    if (!p) throw new NotFoundException();
    return p;
  }

  @Get('highlights')
  highlights(
    @Query('techOnly') techOnly?: string,
    @Query('limit') limit?: string,
    @Query('advertiser') advertiser?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('preferred') preferred?: string,
    @Query('sort') sort?: string,
  ) {
    const n = limit ? Number.parseInt(limit, 10) : 12;
    const min = minPrice ? Number.parseFloat(minPrice) : undefined;
    const max = maxPrice ? Number.parseFloat(maxPrice) : undefined;
    const preferredKeywords =
      preferred
        ?.split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0) || [];
    return this.catalog.highlights(
      techOnly === '1' || techOnly === 'true',
      Number.isFinite(n) ? n : 12,
      {
        advertiser: advertiser?.trim() || undefined,
        minPrice: Number.isFinite(min ?? Number.NaN) ? min : undefined,
        maxPrice: Number.isFinite(max ?? Number.NaN) ? max : undefined,
        preferredKeywords,
        sortMode:
          sort === 'save_eur' || sort === 'save_percent' || sort === 'premium'
            ? sort
            : 'balanced',
      },
    );
  }
}
