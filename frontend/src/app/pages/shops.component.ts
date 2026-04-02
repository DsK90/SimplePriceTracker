import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  EMPTY,
  finalize,
  map,
  of,
  switchMap,
} from 'rxjs';
import { AuthService } from '../core/auth.service';

export type CatalogListItem = {
  feedKey: string;
  title: string;
  price: string | number;
  currency: string;
  advertiserName: string | null;
  brand: string | null;
  imageUrl: string | null;
  imageUrl2: string | null;
  merchantDeepLink: string;
  category: string | null;
  categoryPath: string | null;
  description: string | null;
  productModel: string | null;
  modelNumber: string | null;
  rrpPrice: string | number | null;
  basePrice: string | number | null;
  deliveryCost: string | number | null;
  reviewsText: string | null;
  averageRating: string | number | null;
  stockStatus: string | null;
  stockQuantity: number | null;
  awDeepLink: string | null;
  language: string | null;
  categoryId: string | null;
  dataFeedId: string | null;
  displayPriceRaw: string | null;
  storePrice: string | number | null;
  savingsPercent: string | number | null;
  savingAmount: string | number | null;
  promotionalText: string | null;
  feedProductUpdatedAt: string | null;
};

export type CatalogProductDetail = CatalogListItem & {
  awProductId: string | null;
  merchantProductId: string | null;
  ean: string | null;
  updatedFromFeedAt?: string;
};

type ApiErrorBody = {
  code?: string;
  limit?: number;
  message?: string | string[];
};

type TrackingCreated = { id: string };

@Component({
  selector: 'app-shops',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './shops.component.html',
})
export class ShopsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  private readonly searchPageSize = 20;
  private readonly searchSentinel = viewChild<ElementRef<HTMLElement>>('searchSentinel');
  private readonly searchRequestId = signal(0);

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly loading = signal(false);
  protected readonly budgetLoading = signal(false);
  protected readonly premiumLoading = signal(false);
  protected readonly accessoryLoading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hits = signal<CatalogListItem[]>([]);
  protected readonly searchHasMore = signal(false);
  protected readonly searchLoadingMore = signal(false);
  private readonly searchNextOffset = signal(0);
  protected readonly budgetOffers = signal<CatalogListItem[]>([]);
  protected readonly premiumOffers = signal<CatalogListItem[]>([]);
  protected readonly accessoryOffers = signal<CatalogListItem[]>([]);
  protected readonly productCount = signal<number | null>(null);
  protected readonly detailOpen = signal(false);
  protected readonly detailLoading = signal(false);
  protected readonly detailProduct = signal<CatalogProductDetail | null>(null);
  protected readonly watchlistAddSaving = signal(false);
  protected readonly watchlistAddError = signal<string | null>(null);
  protected readonly watchlistAddSuccess = signal(false);

  constructor() {
    effect((onCleanup) => {
      const el = this.searchSentinel()?.nativeElement;
      if (!el) return;
      const obs = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) this.loadMoreSearch();
          }
        },
        { root: null, rootMargin: '400px', threshold: 0 },
      );
      obs.observe(el);
      onCleanup(() => obs.disconnect());
    });
  }

  ngOnInit(): void {
    this.loadStats();
    this.loadAllOfferSections();

    this.searchControl.valueChanges
      .pipe(
        debounceTime(220),
        distinctUntilChanged(),
        switchMap((raw) => {
          const q = (raw ?? '').trim();
          if (q.length < 2) {
            this.searchRequestId.update((x) => x + 1);
            this.hits.set([]);
            this.searchHasMore.set(false);
            this.searchNextOffset.set(0);
            this.error.set(null);
            this.loading.set(false);
            return EMPTY;
          }
          const rid = this.searchRequestId() + 1;
          this.searchRequestId.set(rid);
          this.loading.set(true);
          this.error.set(null);
          const params: Record<string, string> = {
            q,
            limit: String(this.searchPageSize),
            offset: '0',
            techOnly: '1',
          };
          return this.http
            .get<CatalogListItem[]>(`${environment.apiUrl}/catalog/search`, { params })
            .pipe(
              map((list) => ({ rid, list })),
              catchError(() => {
                this.error.set('shops.searchError');
                return of({ rid, list: [] as CatalogListItem[] });
              }),
              finalize(() => this.loading.set(false)),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ rid, list }) => {
        if (rid !== this.searchRequestId()) return;
        this.hits.set(list);
        this.searchNextOffset.set(list.length);
        this.searchHasMore.set(list.length >= this.searchPageSize);
      });
  }

  private loadMoreSearch(): void {
    const q = this.searchControl.value.trim();
    if (q.length < 2) return;
    if (this.loading() || this.searchLoadingMore() || !this.searchHasMore()) {
      return;
    }
    const rid = this.searchRequestId();
    const offset = this.searchNextOffset();
    this.searchLoadingMore.set(true);
    const params: Record<string, string> = {
      q,
      limit: String(this.searchPageSize),
      offset: String(offset),
      techOnly: '1',
    };
    this.http
      .get<CatalogListItem[]>(`${environment.apiUrl}/catalog/search`, { params })
      .pipe(
        catchError(() => of(null)),
        finalize(() => this.searchLoadingMore.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((next) => {
        if (rid !== this.searchRequestId()) return;
        if (next === null) return;
        if (next.length === 0) {
          this.searchHasMore.set(false);
          return;
        }
        this.searchNextOffset.set(offset + next.length);
        this.searchHasMore.set(next.length >= this.searchPageSize);
        const seen = new Set(this.hits().map((h) => h.feedKey));
        const merged = [...this.hits()];
        for (const h of next) {
          if (seen.has(h.feedKey)) continue;
          seen.add(h.feedKey);
          merged.push(h);
        }
        this.hits.set(merged);
      });
  }

  private loadStats(): void {
    this.http
      .get<{ productCount: number }>(`${environment.apiUrl}/catalog/stats`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => this.productCount.set(s.productCount),
        error: () => this.productCount.set(null),
      });
  }

  private loadAllOfferSections(): void {
    this.loadOfferSection('budget');
    this.loadOfferSection('premium');
    this.loadOfferSection('accessory');
  }

  private loadOfferSection(kind: 'budget' | 'premium' | 'accessory'): void {
    const loadingSignal =
      kind === 'budget'
        ? this.budgetLoading
        : kind === 'premium'
          ? this.premiumLoading
          : this.accessoryLoading;
    const setItems =
      kind === 'budget'
        ? this.budgetOffers
        : kind === 'premium'
          ? this.premiumOffers
          : this.accessoryOffers;

    loadingSignal.set(true);
    const params: Record<string, string> = {
      limit: kind === 'budget' || kind === 'premium' ? '10' : '20',
      techOnly: '1',
    };
    if (kind === 'budget') {
      params['maxPrice'] = '899';
      params['priceSort'] = 'asc';
      params['compose'] = '1';
      params['preferred'] =
        'laptop,notebook,chromebook,computer,desktop,pc-system,workstation,komplett-pc,gaming-pc';
    } else if (kind === 'premium') {
      params['minPrice'] = '999';
      params['priceSort'] = 'desc';
      params['compose'] = '1';
      params['preferred'] =
        'laptop,workstation,macbook,apple,oled,sony,canon,ipad,grafikkarte,gpu';
    } else {
      params['preferred'] =
        'tasche,hülle,huelle,kabel,adapter,dock,halterung,maus,mouse,tastatur,headset,ladegerät,case,cover,sleeve,powerbank,rucksack';
    }
    this.http
      .get<CatalogListItem[]>(`${environment.apiUrl}/catalog/highlights`, { params })
      .pipe(
        catchError(() => of([] as CatalogListItem[])),
        finalize(() => loadingSignal.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((h) => {
        setItems.set(h);
        this.deduplicateOfferSections();
      });
  }

  private deduplicateOfferSections(): void {
    const seen = new Set<string>();
    const dedupe = (items: CatalogListItem[]) => {
      const out: CatalogListItem[] = [];
      for (const item of items) {
        if (seen.has(item.feedKey)) continue;
        seen.add(item.feedKey);
        out.push(item);
      }
      return out;
    };

    const budget = dedupe(this.budgetOffers());
    const premium = dedupe(this.premiumOffers());
    const accessory = dedupe(this.accessoryOffers());

    this.budgetOffers.set(budget.slice(0, 10));
    this.premiumOffers.set(premium.slice(0, 10));
    this.accessoryOffers.set(accessory.slice(0, 10));
  }

  openDetail(item: CatalogListItem): void {
    this.watchlistAddError.set(null);
    this.watchlistAddSuccess.set(false);
    this.detailOpen.set(true);
    this.detailLoading.set(true);
    this.detailProduct.set(null);
    const key = encodeURIComponent(item.feedKey);
    this.http
      .get<CatalogProductDetail>(`${environment.apiUrl}/catalog/product/${key}`)
      .pipe(
        catchError(() => of(null)),
        finalize(() => this.detailLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((p) => this.detailProduct.set(p));
  }

  closeDetail(): void {
    this.detailOpen.set(false);
    this.detailProduct.set(null);
    this.watchlistAddError.set(null);
    this.watchlistAddSuccess.set(false);
  }

  addProductToWatchlist(): void {
    const p = this.detailProduct();
    if (!p?.feedKey?.trim()) return;
    this.watchlistAddSaving.set(true);
    this.watchlistAddError.set(null);
    this.watchlistAddSuccess.set(false);
    this.http
      .post<TrackingCreated>(`${environment.apiUrl}/trackings`, { awinFeedKey: p.feedKey.trim() })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.watchlistAddSaving.set(false)),
      )
      .subscribe({
        next: () => {
          this.watchlistAddSuccess.set(true);
        },
        error: (e: { error?: ApiErrorBody }) => {
          this.watchlistAddError.set(this.messageFromApiError(e, 'shops.addToWatchlistFailed'));
        },
      });
  }

  goToDashboard(): void {
    void this.router.navigateByUrl('/dashboard');
  }

  private messageFromApiError(err: { error?: ApiErrorBody }, fallbackKey: string): string {
    const body = err.error;
    if (body?.code === 'FREE_TRACKING_LIMIT') {
      return this.translate.instant('dashboard.errors.freeTrackingLimit', {
        max: body.limit ?? 5,
      });
    }
    if (body?.code === 'AWIN_PRODUCT_NOT_IN_CATALOG') {
      return this.translate.instant('dashboard.errors.awinNotInCatalog');
    }
    if (body?.code === 'EMAIL_ALERT_LIMIT') {
      return this.translate.instant('dashboard.errors.emailAlertLimit', {
        max: body.limit ?? 2,
      });
    }
    const m = body?.message;
    if (Array.isArray(m)) return m[0] ?? this.translate.instant(fallbackKey);
    if (typeof m === 'string' && m.length > 0) return m;
    return this.translate.instant(fallbackKey);
  }

  num(v: string | number | null | undefined): number | null {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : Number.parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  formatPrice(v: string | number | null | undefined, currency: string): string {
    const n = this.num(v);
    if (n == null) return '—';
    try {
      return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency || 'EUR' }).format(n);
    } catch {
      return `${n.toFixed(2)} ${currency}`;
    }
  }

  formatRating(v: string | number | null | undefined): string {
    const n = this.num(v);
    if (n == null) return '';
    return n.toFixed(1);
  }

  formatFeedDate(iso: string | null | undefined): string {
    if (iso == null || iso === '') return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  }

  discountPercent(item: CatalogListItem): number | null {
    const price = this.num(item.price);
    const rrp = this.num(item.rrpPrice);
    if (price == null || rrp == null || rrp <= 0 || price >= rrp) return null;
    return Math.round(((rrp - price) / rrp) * 100);
  }

  savedAmount(item: CatalogListItem): number | null {
    const price = this.num(item.price);
    const rrp = this.num(item.rrpPrice);
    if (price == null || rrp == null || rrp <= price) return null;
    return rrp - price;
  }

  hasActiveSearch(): boolean {
    return this.searchControl.value.trim().length >= 2;
  }
}
