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
  tap,
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
  protected readonly techOnly = signal(true);
  protected readonly loading = signal(false);
  protected readonly highlightsLoading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hits = signal<CatalogListItem[]>([]);
  protected readonly highlights = signal<CatalogListItem[]>([]);
  protected readonly productCount = signal<number | null>(null);
  protected readonly detailOpen = signal(false);
  protected readonly detailLoading = signal(false);
  protected readonly detailProduct = signal<CatalogProductDetail | null>(null);

  ngOnInit(): void {
    this.loadStats();
    this.loadHighlights();

    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
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
            limit: '24',
            offset: '0',
          };
          if (this.techOnly()) params['techOnly'] = '1';
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

  toggleTechOnly(): void {
    this.techOnly.update((v) => !v);
    const q = this.searchControl.value.trim();
    if (q.length >= 2) {
      this.searchControl.setValue(q, { emitEvent: true });
    } else {
      this.loadHighlights();
    }
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

  private loadHighlights(): void {
    this.highlightsLoading.set(true);
    const params: Record<string, string> = { limit: '12' };
    if (this.techOnly()) params['techOnly'] = '1';
    this.http
      .get<CatalogListItem[]>(`${environment.apiUrl}/catalog/highlights`, { params })
      .pipe(
        catchError(() => of([] as CatalogListItem[])),
        finalize(() => this.highlightsLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((h) => this.highlights.set(h));
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
}
