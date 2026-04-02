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
  highlights(@Query('techOnly') techOnly?: string, @Query('limit') limit?: string) {
    const n = limit ? Number.parseInt(limit, 10) : 12;
    return this.catalog.highlights(
      techOnly === '1' || techOnly === 'true',
      Number.isFinite(n) ? n : 12,
    );
  }
}
