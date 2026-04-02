import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
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
  merchantDeepLink: string;
  category: string | null;
  categoryPath: string | null;
  description: string | null;
  productModel: string | null;
  modelNumber: string | null;
  rrpPrice: string | number | null;
  basePrice: string | number | null;
  deliveryCost: string | number | null;
};

export type CatalogProductDetail = CatalogListItem & {
  awProductId: string | null;
  merchantProductId: string | null;
  ean: string | null;
  updatedFromFeedAt?: string;
};

type OfferSortMode = 'balanced' | 'save_eur' | 'save_percent' | 'premium';

@Component({
  selector: 'app-shops',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './shops.component.html',
})
export class ShopsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly loading = signal(false);
  protected readonly bestLoading = signal(false);
  protected readonly alternateLoading = signal(false);
  protected readonly expertLoading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hits = signal<CatalogListItem[]>([]);
  protected readonly bestOffers = signal<CatalogListItem[]>([]);
  protected readonly alternateOffers = signal<CatalogListItem[]>([]);
  protected readonly expertOffers = signal<CatalogListItem[]>([]);
  protected readonly productCount = signal<number | null>(null);
  protected readonly detailOpen = signal(false);
  protected readonly detailLoading = signal(false);
  protected readonly detailProduct = signal<CatalogProductDetail | null>(null);
  protected readonly offerSortMode = signal<OfferSortMode>('balanced');

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
            this.hits.set([]);
            this.error.set(null);
            this.loading.set(false);
            return of([] as CatalogListItem[]);
          }
          this.loading.set(true);
          this.error.set(null);
          const params: Record<string, string> = {
            q,
            limit: '18',
            offset: '0',
            techOnly: '1',
          };
          return this.http
            .get<CatalogListItem[]>(`${environment.apiUrl}/catalog/search`, { params })
            .pipe(
              catchError(() => {
                this.error.set('shops.searchError');
                return of([] as CatalogListItem[]);
              }),
              finalize(() => this.loading.set(false)),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((list) => this.hits.set(list));
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
    this.loadOfferSection('best');
    this.loadOfferSection('alternate');
    this.loadOfferSection('expert');
  }

  private loadOfferSection(kind: 'best' | 'alternate' | 'expert'): void {
    const loadingSignal =
      kind === 'best'
        ? this.bestLoading
        : kind === 'alternate'
          ? this.alternateLoading
          : this.expertLoading;
    const setItems =
      kind === 'best'
        ? this.bestOffers
        : kind === 'alternate'
          ? this.alternateOffers
          : this.expertOffers;

    loadingSignal.set(true);
    const mode = this.offerSortMode();
    const [minPrice, maxPrice] = this.offerPriceRangeForMode(mode);
    const params: Record<string, string> = {
      limit: '30',
      techOnly: '1',
      minPrice: String(minPrice),
      maxPrice: String(maxPrice),
      preferred: 'laptop,computer,monitor,gpu,grafikkarte,ssd',
      sort: mode,
    };
    if (kind === 'alternate') params['advertiser'] = 'alternate';
    if (kind === 'expert') params['advertiser'] = 'expert';
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

  protected setOfferSortMode(mode: OfferSortMode): void {
    if (this.offerSortMode() === mode) return;
    this.offerSortMode.set(mode);
    this.loadAllOfferSections();
  }

  private offerPriceRangeForMode(mode: OfferSortMode): [number, number] {
    switch (mode) {
      case 'save_percent':
        return [120, 3000];
      case 'save_eur':
      case 'premium':
        return [300, 3500];
      case 'balanced':
      default:
        return [180, 3200];
    }
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

    const best = dedupe(this.bestOffers());
    const alternate = dedupe(this.alternateOffers());
    const expert = dedupe(this.expertOffers());

    this.bestOffers.set(best.slice(0, 10));
    this.alternateOffers.set(alternate.slice(0, 10));
    this.expertOffers.set(expert.slice(0, 10));
  }

  openDetail(item: CatalogListItem): void {
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
