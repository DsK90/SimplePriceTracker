import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, HostListener, OnInit, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService, UserProfile } from '../core/auth.service';
import { COMMON_TIME_ZONES } from '../core/common-time-zones';
import { DashboardUiService } from '../core/dashboard-ui.service';
import { parseDecimalInput } from '../core/parse-decimal-input';
import { PushNotificationService } from '../core/push-notification.service';
import { environment } from '../../environments/environment';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  finalize,
  map,
  of,
  switchMap,
  tap,
} from 'rxjs';

type CatalogHit = {
  feedKey: string;
  title: string;
  price: string;
  currency: string;
  advertiserName: string | null;
  brand: string | null;
  imageUrl: string | null;
  imageUrl2?: string | null;
  merchantDeepLink: string;
  category: string | null;
  categoryPath?: string | null;
  description?: string | null;
  productModel?: string | null;
  modelNumber?: string | null;
  rrpPrice?: string | number | null;
  basePrice?: string | number | null;
  deliveryCost?: string | number | null;
  reviewsText?: string | null;
  averageRating?: string | number | null;
  stockStatus?: string | null;
  stockQuantity?: number | null;
  awDeepLink?: string | null;
  language?: string | null;
  categoryId?: string | null;
  dataFeedId?: string | null;
  displayPriceRaw?: string | null;
  storePrice?: string | number | null;
  savingsPercent?: string | number | null;
  savingAmount?: string | number | null;
  promotionalText?: string | null;
  feedProductUpdatedAt?: string | null;
};

type Tracking = {
  id: string;
  url: string;
  awinFeedKey?: string | null;
  /** Catalog UVP/RRP (decimal string) when Awin-backed; from GET /trackings enrich. */
  catalogListPrice?: string | null;
  productName: string;
  companyName: string | null;
  displayProductName: string;
  displayCompanyName: string | null;
  productNameOverride: string | null;
  companyNameOverride: string | null;
  alertBelowPrice: string | null;
  alertAbovePrice: string | null;
  emailAlertsEnabled: boolean;
  lastPrice: string | null;
  currency: string;
  lastCheckedAt: string | null;
  active: boolean;
  createdAt: string;
  sortOrder?: number;
  snapshots?: { price: string; recordedAt: string; currency?: string }[];
};

type PriceAlertI18nPayload = {
  i18n: {
    titleKey: string;
    bodyKey: string;
    params: Record<string, string>;
  };
};

type AppNotification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  trackingId: string | null;
  payload?: PriceAlertI18nPayload | null;
};

type ApiErrorBody = {
  code?: string;
  limit?: number;
  message?: string | string[];
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, NgTemplateOutlet, TranslatePipe, DragDropModule],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  /** Only true in non-production Angular environment (see `environment.prod.ts`). */
  protected readonly demoPriceEnabled = environment.enableDemoProduct;

  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private translate = inject(TranslateService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private dashboardUi = inject(DashboardUiService);
  private breakpointObserver = inject(BreakpointObserver);
  protected push = inject(PushNotificationService);

  /** Only one of mobile vs desktop lists is rendered — avoids duplicate CDK drop lists. */
  readonly isMobileLayout = toSignal(
    this.breakpointObserver.observe('(max-width: 767px)').pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  form = this.fb.nonNullable.group({
    search: [''],
  });

  catalogHits = signal<CatalogHit[]>([]);
  catalogLoading = signal(false);
  /** Set when catalog search API fails (auth/network/server); otherwise null. */
  catalogSearchError = signal<string | null>(null);
  /** Last trimmed query used for catalog search (for empty-state copy). */
  catalogSearchQuery = signal('');
  /** Rows in AwinCatalogProduct on the API (null = not loaded or request failed). */
  catalogProductCount = signal<number | null>(null);
  selectedCatalogHit = signal<CatalogHit | null>(null);
  private readonly catalogSearchCache = new Map<string, { hits: CatalogHit[]; ts: number }>();
  private static readonly CATALOG_SEARCH_CACHE_TTL_MS = 120_000;
  private static readonly CATALOG_SEARCH_CACHE_MAX = 100;

  editForm = this.fb.nonNullable.group({
    productNameOverride: [''],
    companyNameOverride: [''],
    alertBelowPrice: [''],
    alertAbovePrice: [''],
    emailAlertsEnabled: [false],
  });

  /** Global once-daily check time (all products); persisted via PATCH /auth/me/daily-check. */
  scheduleForm = this.fb.nonNullable.group({
    dailyCheckLocalTime: ['08:00'],
    dailyCheckTimeZone: ['Europe/Berlin'],
  });

  items = signal<Tracking[]>([]);
  profile = signal<UserProfile | null>(null);
  loading = signal(true);
  saving = signal(false);
  savingEdit = signal(false);
  scheduleSaving = signal(false);
  scheduleSaved = signal(false);
  scheduleError = signal<string | null>(null);
  /** Daily schedule card: hidden after save until user opens via clock (persisted after first save). */
  dailySchedulePanelOpen = signal(true);
  private static readonly DAILY_SCHEDULE_PANEL_KEY = 'pricefly_daily_schedule_collapsed';
  refreshingId = signal<string | null>(null);
  formError = signal<string | null>(null);
  refreshError = signal<string | null>(null);
  patchError = signal<string | null>(null);
  editingId = signal<string | null>(null);
  mobileReorder = signal(false);

  notifications = signal<AppNotification[]>([]);
  notifCount = signal(0);
  notifOpen = signal(false);
  notifLoading = signal(false);

  demoAdding = signal(false);

  scrapeMessage = signal('');
  private scheduleSavedTimer: ReturnType<typeof setTimeout> | null = null;
  private scrapeInterval: ReturnType<typeof setInterval> | null = null;
  private scrapeIdx = 0;
  private static readonly CATALOG_BUSY_MSG_COUNT = 4;
  private static readonly PRICE_NOT_FOUND_MSG_COUNT = 10;
  private static readonly CATALOG_SEARCH_DEBOUNCE_MS = 140;

  /** Pro-only: overlay with price snapshots for one tracking. */
  historyTracking = signal<Tracking | null>(null);

  pushLoading = signal(true);
  pushUnsupported = signal(false);
  pushServerOn = signal(false);
  pushSubscribed = signal(false);
  pushDenied = signal(false);
  pushBusy = signal(false);
  pushBannerDismissed = signal(false);
  pushReminderVisible = signal(false);
  private pushReminderTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly PUSH_REMINDER_KEY = 'pricefly_push_reminder';
  private static readonly PUSH_REMINDER_DELAYS = [0, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 12 * 3600_000];

  private readonly addBusyMsgEffect = effect(() => {
    const active = this.saving();
    if (active) {
      this.scrapeIdx = 0;
      this.scrapeMessage.set(this.translate.instant('dashboard.catalogBusyMsg0'));
      this.scrapeInterval = setInterval(() => {
        this.scrapeIdx = (this.scrapeIdx + 1) % DashboardComponent.CATALOG_BUSY_MSG_COUNT;
        this.scrapeMessage.set(
          this.translate.instant(`dashboard.catalogBusyMsg${this.scrapeIdx}`),
        );
      }, 2200);
    } else {
      if (this.scrapeInterval) {
        clearInterval(this.scrapeInterval);
        this.scrapeInterval = null;
      }
      this.scrapeMessage.set('');
    }
  });

  @HostListener('document:keydown.escape')
  onHistoryEscape(): void {
    if (this.historyTracking()) this.closePriceHistory();
  }

  private messageFromApiError(err: { error?: ApiErrorBody }, fallbackKey: string): string {
    const body = err.error;
    if (body?.code === 'FREE_TRACKING_LIMIT') {
      return this.translate.instant('dashboard.errors.freeTrackingLimit', {
        max: body.limit ?? 5,
      });
    }
    if (body?.code === 'PRICE_NOT_FOUND') {
      const i = Math.floor(Math.random() * DashboardComponent.PRICE_NOT_FOUND_MSG_COUNT);
      return this.translate.instant(`dashboard.errors.priceNotFound${i}`);
    }
    if (body?.code === 'AWIN_PRODUCT_NOT_IN_CATALOG') {
      return this.translate.instant('dashboard.errors.awinNotInCatalog');
    }
    if (body?.code === 'LEGACY_NO_AWINSYNC') {
      return this.translate.instant('dashboard.errors.legacyRefresh');
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

  private normCatalogQuery(raw: string): string {
    return raw.trim().toLowerCase();
  }

  private pickLocalCatalogCache(query: string): CatalogHit[] | null {
    const q = this.normCatalogQuery(query);
    if (!q) return null;
    const now = Date.now();

    const exact = this.catalogSearchCache.get(q);
    if (exact && now - exact.ts <= DashboardComponent.CATALOG_SEARCH_CACHE_TTL_MS) {
      return exact.hits;
    }

    let bestPrefix: string | null = null;
    let bestHits: CatalogHit[] | null = null;
    for (const [k, v] of this.catalogSearchCache.entries()) {
      if (now - v.ts > DashboardComponent.CATALOG_SEARCH_CACHE_TTL_MS) continue;
      if (!q.startsWith(k)) continue;
      if (!bestPrefix || k.length > bestPrefix.length) {
        bestPrefix = k;
        bestHits = v.hits;
      }
    }
    if (!bestHits) return null;
    return bestHits.filter((h) => {
      const title = h.title.toLowerCase();
      const advertiser = (h.advertiserName ?? '').toLowerCase();
      const brand = (h.brand ?? '').toLowerCase();
      const category = (h.category ?? '').toLowerCase();
      const path = (h.categoryPath ?? '').toLowerCase();
      return (
        title.includes(q) ||
        advertiser.includes(q) ||
        brand.includes(q) ||
        category.includes(q) ||
        path.includes(q)
      );
    });
  }

  private rememberCatalogQuery(query: string, hits: CatalogHit[]): void {
    const q = this.normCatalogQuery(query);
    if (q.length < 2) return;
    this.catalogSearchCache.set(q, { hits, ts: Date.now() });
    if (this.catalogSearchCache.size <= DashboardComponent.CATALOG_SEARCH_CACHE_MAX) return;
    const oldest = this.catalogSearchCache.keys().next().value as string | undefined;
    if (oldest) this.catalogSearchCache.delete(oldest);
  }

  ngOnInit() {
    try {
      if (
        typeof localStorage !== 'undefined' &&
        localStorage.getItem(DashboardComponent.DAILY_SCHEDULE_PANEL_KEY) === '1'
      ) {
        this.dailySchedulePanelOpen.set(false);
      }
    } catch {
      /* ignore */
    }

    this.destroyRef.onDestroy(() => {
      if (this.scrapeInterval) clearInterval(this.scrapeInterval);
      if (this.pushReminderTimer) clearTimeout(this.pushReminderTimer);
      if (this.scheduleSavedTimer) clearTimeout(this.scheduleSavedTimer);
    });
    this.dashboardUi.toggleNotifications.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.toggleNotifs());
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((q: Params) => {
      if (q['notifs'] === '1') {
        this.notifOpen.set(true);
        this.loadNotifications();
        void this.router.navigate([], {
          relativeTo: this.route,
          replaceUrl: true,
          queryParams: {},
        });
      }
    });
    this.auth.loadProfile().subscribe({
      next: (p) => {
        this.profile.set(p);
        this.patchScheduleFromProfile(p);
      },
      error: () => {},
    });
    this.load();
    this.loadNotifCount();
    void this.initPush();

    this.http
      .get<{ productCount: number }>(`${environment.apiUrl}/catalog/stats`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => this.catalogProductCount.set(s.productCount),
        error: () => this.catalogProductCount.set(null),
      });

    this.form.controls.search.valueChanges
      .pipe(
        debounceTime(DashboardComponent.CATALOG_SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((raw) => {
          const q = (raw ?? '').trim();
          const sel = this.selectedCatalogHit();
          if (sel && q !== sel.title) this.selectedCatalogHit.set(null);
          this.catalogSearchQuery.set(q);
          if (q.length < 2) {
            this.catalogHits.set([]);
            this.catalogSearchError.set(null);
            return of([] as CatalogHit[]);
          }

          const instantHits = this.pickLocalCatalogCache(q);
          if (instantHits && instantHits.length > 0) {
            this.catalogHits.set(instantHits.slice(0, 30));
          }
          this.catalogLoading.set(true);
          this.catalogSearchError.set(null);
          return this.http
            .get<CatalogHit[]>(`${environment.apiUrl}/catalog/search`, {
              params: { q, limit: '30', techOnly: '1' },
            })
            .pipe(
              tap((hits) => this.rememberCatalogQuery(q, hits)),
              catchError(() => {
                this.catalogSearchError.set(
                  this.translate.instant('dashboard.catalogSearchError'),
                );
                return of([] as CatalogHit[]);
              }),
              finalize(() => this.catalogLoading.set(false)),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((hits) => this.catalogHits.set(hits));
  }

  selectCatalogHit(h: CatalogHit): void {
    this.selectedCatalogHit.set(h);
    this.form.patchValue({ search: h.title }, { emitEvent: false });
    this.catalogHits.set([]);
    this.catalogSearchError.set(null);
    this.formError.set(null);
  }

  /** Show list price in catalog dropdown when feed provides RRP above current price. */
  protected catalogShowRrp(h: CatalogHit): boolean {
    if (h.rrpPrice == null || h.rrpPrice === '') return false;
    const rrp = Number(h.rrpPrice);
    const price = Number(h.price);
    return Number.isFinite(rrp) && Number.isFinite(price) && rrp > price;
  }

  private hasAlertThresholds(): boolean {
    return this.items().some((t) => t.alertBelowPrice || t.alertAbovePrice);
  }

  schedulePushReminder(): void {
    if (this.pushReminderTimer) clearTimeout(this.pushReminderTimer);
    this.pushReminderVisible.set(false);

    if (this.pushSubscribed() || this.pushUnsupported() || !this.pushServerOn() || this.pushDenied()) return;
    if (!this.hasAlertThresholds()) return;

    const raw = localStorage.getItem(DashboardComponent.PUSH_REMINDER_KEY);
    const state = raw ? JSON.parse(raw) as { count: number; lastDismissed: number } : null;
    const count = state?.count ?? 0;
    const lastDismissed = state?.lastDismissed ?? 0;

    const delays = DashboardComponent.PUSH_REMINDER_DELAYS;
    const delay = delays[Math.min(count, delays.length - 1)];

    const elapsed = Date.now() - lastDismissed;
    const remaining = Math.max(0, delay - elapsed);

    this.pushReminderTimer = setTimeout(() => this.pushReminderVisible.set(true), remaining);
  }

  dismissPushReminder(): void {
    this.pushReminderVisible.set(false);
    const raw = localStorage.getItem(DashboardComponent.PUSH_REMINDER_KEY);
    const state = raw ? JSON.parse(raw) as { count: number; lastDismissed: number } : { count: 0, lastDismissed: 0 };
    state.count++;
    state.lastDismissed = Date.now();
    localStorage.setItem(DashboardComponent.PUSH_REMINDER_KEY, JSON.stringify(state));
  }

  async enablePushFromReminder(): Promise<void> {
    await this.enablePush();
    this.pushReminderVisible.set(false);
    localStorage.removeItem(DashboardComponent.PUSH_REMINDER_KEY);
  }

  async initPush(): Promise<void> {
    this.pushLoading.set(true);
    try {
      const st = await this.push.refreshPushState();
      if (st.permission === 'unsupported') {
        this.pushUnsupported.set(true);
        return;
      }
      this.pushServerOn.set(st.serverConfigured);
      this.pushSubscribed.set(st.subscribed);
      this.pushDenied.set(st.permission === 'denied');
      if (st.serverConfigured && st.subscribed) {
        await this.push.syncSubscriptionToServer();
      }
    } finally {
      this.pushLoading.set(false);
      this.schedulePushReminder();
    }
  }

  async enablePush(): Promise<void> {
    this.pushBusy.set(true);
    try {
      const r = await this.push.subscribe();
      if (r.ok) {
        this.pushSubscribed.set(true);
        this.pushDenied.set(false);
      } else if (r.reason === 'denied') {
        this.pushDenied.set(true);
      }
    } finally {
      this.pushBusy.set(false);
      await this.initPush();
    }
  }

  async disablePush(): Promise<void> {
    this.pushBusy.set(true);
    try {
      await this.push.unsubscribe();
      this.pushSubscribed.set(false);
    } finally {
      this.pushBusy.set(false);
      await this.initPush();
    }
  }

  thumbChar(t: Tracking): string {
    const s = t.displayProductName?.trim() || '?';
    return s.charAt(0).toUpperCase();
  }

  /** Max products with email alerts: 2 free, 10 Pro (push unlimited). */
  protected emailAlertMax(): number {
    const p = this.profile();
    return p?.planTier === 'PRO' || p?.isAdmin ? Infinity : 2;
  }

  protected emailAlertsUsedExcluding(trackingId: string): number {
    return this.items().filter((x) => x.emailAlertsEnabled && x.id !== trackingId).length;
  }

  protected canEnableEmailAlerts(t: Tracking): boolean {
    if (t.emailAlertsEnabled) return true;
    return this.emailAlertsUsedExcluding(t.id) < this.emailAlertMax();
  }

  protected timeZoneSelectOptions(): string[] {
    const tz = (
      this.scheduleForm.getRawValue().dailyCheckTimeZone ||
      this.profile()?.dailyCheckTimeZone ||
      'Europe/Berlin'
    ).trim();
    const list = [...COMMON_TIME_ZONES];
    if (tz && !list.includes(tz)) return [tz, ...list];
    return list;
  }

  private patchScheduleFromProfile(p: UserProfile): void {
    this.scheduleForm.patchValue({
      dailyCheckLocalTime: p.dailyCheckLocalTime ?? '08:00',
      dailyCheckTimeZone: p.dailyCheckTimeZone ?? 'Europe/Berlin',
    });
  }

  saveDailyCheck(): void {
    this.scheduleError.set(null);
    let time = this.scheduleForm.getRawValue().dailyCheckLocalTime.trim();
    if (/^\d:\d{2}$/.test(time)) time = `0${time}`;
    const tz = this.scheduleForm.getRawValue().dailyCheckTimeZone.trim();
    this.scheduleSaving.set(true);
    this.http
      .patch<UserProfile>(`${environment.apiUrl}/auth/me/daily-check`, {
        dailyCheckLocalTime: time,
        dailyCheckTimeZone: tz,
      })
      .subscribe({
        next: (u) => {
          this.auth.user.set(u);
          this.profile.set(u);
          this.patchScheduleFromProfile(u);
          this.scheduleSaving.set(false);
          try {
            localStorage.setItem(DashboardComponent.DAILY_SCHEDULE_PANEL_KEY, '1');
          } catch {
            /* ignore */
          }
          this.dailySchedulePanelOpen.set(false);
          if (this.scheduleSavedTimer) clearTimeout(this.scheduleSavedTimer);
          this.scheduleSaved.set(true);
          this.scheduleSavedTimer = setTimeout(() => {
            this.scheduleSaved.set(false);
            this.scheduleSavedTimer = null;
          }, 4000);
        },
        error: (e) => {
          this.scheduleSaving.set(false);
          this.scheduleError.set(this.messageFromApiError(e, 'dashboard.errors.scheduleSaveFailed'));
        },
      });
  }

  toggleDailySchedulePanel(): void {
    this.dailySchedulePanelOpen.update((open) => !open);
  }

  /**
   * Tailwind classes with `/` cannot use `[class.foo/bar]` — Angular treats `/` as invalid in that binding.
   */
  protected schedulePanelOpenClasses(): Record<string, boolean> {
    const on = this.dailySchedulePanelOpen();
    return {
      'border-primary/45': on,
      'text-primary': on,
    };
  }

  protected isPro(): boolean {
    const p = this.profile();
    return p?.planTier === 'PRO' || p?.isAdmin === true;
  }

  openPriceHistory(t: Tracking): void {
    if (!this.isPro()) return;
    this.historyTracking.set(t);
  }

  closePriceHistory(): void {
    this.historyTracking.set(null);
  }

  closePriceHistoryBackdrop(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.closePriceHistory();
  }

  snapshotCurrency(s: { currency?: string }, t: Tracking): string {
    return s.currency ?? t.currency;
  }

  protected currencySymbol(code?: string | null): string {
    if (!code) return '';
    try {
      const parts = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: code,
        currencyDisplay: 'narrowSymbol',
      }).formatToParts(0);
      const sym = parts.filter((p) => p.type === 'currency').map((p) => p.value).join('');
      return sym || code;
    } catch {
      return code;
    }
  }

  priceDelta(t: Tracking): { pct: number; label: string } | null {
    const s = t.snapshots;
    if (!s || s.length < 2) return null;
    const cur = parseFloat(String(s[0].price));
    const prev = parseFloat(String(s[1].price));
    if (!Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return null;
    const raw = ((cur - prev) / prev) * 100;
    const pct = Math.round(raw);
    if (pct === 0) return { pct: 0, label: this.translate.instant('dashboard.stable') };
    return { pct, label: pct > 0 ? `+${pct}%` : `${pct}%` };
  }

  /** Absolute savings when price dropped (current vs previous snapshot). */
  priceSavings(t: Tracking): number | null {
    const s = t.snapshots;
    if (!s || s.length < 2) return null;
    const cur = parseFloat(String(s[0].price));
    const prev = parseFloat(String(s[1].price));
    if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null;
    const diff = prev - cur;
    return diff > 0 ? Math.round(diff * 100) / 100 : null;
  }

  /**
   * Discount vs catalog UVP/RRP (Awin feed) when current tracked price is below list price.
   */
  catalogDiscountVsList(t: Tracking): { pct: number; saveAmount: number; rrp: number } | null {
    if (t.lastPrice == null || t.catalogListPrice == null || t.catalogListPrice === '') return null;
    const rrp = parseFloat(String(t.catalogListPrice).replace(',', '.'));
    const cur = parseFloat(String(t.lastPrice).replace(',', '.'));
    if (!Number.isFinite(rrp) || !Number.isFinite(cur) || rrp <= 0 || cur >= rrp) return null;
    const saveAmount = Math.round((rrp - cur) * 100) / 100;
    const pct = Math.round((saveAmount / rrp) * 100);
    return { pct, saveAmount, rrp };
  }

  isDemoTracking(t: Tracking): boolean {
    return t.url?.startsWith('demo://') ?? false;
  }

  hasDemoRow(): boolean {
    return this.items().some((x) => this.isDemoTracking(x));
  }

  addDemoProduct(): void {
    if (!this.demoPriceEnabled) return;
    this.demoAdding.set(true);
    this.formError.set(null);
    this.http.post<Tracking>(`${environment.apiUrl}/trackings/demo`, {}).subscribe({
      next: () => {
        this.demoAdding.set(false);
        this.load();
      },
      error: (e) => {
        this.demoAdding.set(false);
        this.formError.set(this.messageFromApiError(e, 'dashboard.errors.addFailed'));
      },
    });
  }

  adjustDemoPrice(id: string, delta: number): void {
    if (!this.demoPriceEnabled) return;
    this.refreshingId.set(id);
    this.http.post<Tracking>(`${environment.apiUrl}/trackings/${id}/demo-price`, { delta }).subscribe({
      next: () => {
        this.refreshingId.set(null);
        this.load();
        this.loadNotifCount();
      },
      error: () => this.refreshingId.set(null),
    });
  }

  onDrop(event: CdkDragDrop<Tracking[]>) {
    if (event.previousIndex === event.currentIndex) return;
    this.items.update((list) => {
      const next = [...list];
      moveItemInArray(next, event.previousIndex, event.currentIndex);
      return next;
    });
    const ids = this.items().map((t) => t.id);
    this.http.patch<{ ok: boolean }>(`${environment.apiUrl}/trackings/reorder`, { ids }).subscribe({
      error: () => this.load(),
    });
  }

  load() {
    this.loading.set(true);
    this.http.get<Tracking[]>(`${environment.apiUrl}/trackings`).subscribe({
      next: (rows) => {
        this.items.set(rows);
        this.loading.set(false);
        this.schedulePushReminder();
      },
      error: () => this.loading.set(false),
    });
  }

  loadNotifications() {
    this.notifLoading.set(true);
    this.http.get<AppNotification[]>(`${environment.apiUrl}/notifications`).subscribe({
      next: (rows) => {
        this.notifications.set(rows);
        this.notifLoading.set(false);
      },
      error: () => this.notifLoading.set(false),
    });
  }

  loadNotifCount() {
    this.http.get<{ count: number }>(`${environment.apiUrl}/notifications/unread-count`).subscribe({
      next: (r) => this.notifCount.set(r.count),
      error: () => {},
    });
  }

  toggleNotifs() {
    const next = !this.notifOpen();
    this.notifOpen.set(next);
    if (next) {
      this.loadNotifications();
    }
  }

  /** For template: use with `translate` pipe so language switches refresh copy. */
  notificationI18n(n: AppNotification): { titleKey: string; bodyKey: string; params: Record<string, string> } | null {
    const p = n.payload?.i18n;
    if (p?.titleKey && p?.bodyKey && p.params) return p;
    return null;
  }

  markOneRead(n: AppNotification) {
    if (n.read) return;
    this.http.patch(`${environment.apiUrl}/notifications/${n.id}/read`, {}).subscribe({
      next: () => {
        this.notifications.update((list) =>
          list.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
        );
        this.loadNotifCount();
      },
    });
  }

  markAllRead() {
    this.http.post(`${environment.apiUrl}/notifications/read-all`, {}).subscribe({
      next: () => {
        this.notifications.update((list) => list.map((x) => ({ ...x, read: true })));
        this.notifCount.set(0);
      },
    });
  }

  create() {
    const hit = this.selectedCatalogHit();
    if (!hit) {
      this.formError.set(this.translate.instant('dashboard.errors.pickProduct'));
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    this.http.post<Tracking>(`${environment.apiUrl}/trackings`, { awinFeedKey: hit.feedKey }).subscribe({
      next: () => {
        this.form.reset({ search: '' });
        this.selectedCatalogHit.set(null);
        this.catalogHits.set([]);
        this.saving.set(false);
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.formError.set(this.messageFromApiError(e, 'dashboard.errors.addFailed'));
      },
    });
  }

  toggleEdit(id: string) {
    if (this.editingId() === id) {
      this.editingId.set(null);
      return;
    }
    const t = this.items().find((x) => x.id === id);
    if (!t) return;
    this.patchError.set(null);
    this.editingId.set(id);
    this.editForm.patchValue({
      productNameOverride: t.productNameOverride ?? '',
      companyNameOverride: t.companyNameOverride ?? '',
      alertBelowPrice: t.alertBelowPrice != null ? String(t.alertBelowPrice) : '',
      alertAbovePrice: t.alertAbovePrice != null ? String(t.alertAbovePrice) : '',
      emailAlertsEnabled: t.emailAlertsEnabled ?? false,
    });
  }

  clearEdit() {
    this.editingId.set(null);
  }

  saveEdit(id: string) {
    this.patchError.set(null);
    const v = this.editForm.getRawValue();

    const belowRaw = v.alertBelowPrice;
    const aboveRaw = v.alertAbovePrice;
    const belowEmpty =
      belowRaw === '' || belowRaw === null || belowRaw === undefined;
    const aboveEmpty =
      aboveRaw === '' || aboveRaw === null || aboveRaw === undefined;

    const alertBelowPrice = belowEmpty ? null : parseDecimalInput(String(belowRaw));
    const alertAbovePrice = aboveEmpty ? null : parseDecimalInput(String(aboveRaw));

    if (!belowEmpty && alertBelowPrice === null) {
      this.patchError.set(this.translate.instant('dashboard.errors.invalidDecimal'));
      return;
    }
    if (!aboveEmpty && alertAbovePrice === null) {
      this.patchError.set(this.translate.instant('dashboard.errors.invalidDecimal'));
      return;
    }

    this.savingEdit.set(true);
    const body: Record<string, unknown> = {
      productNameOverride: v.productNameOverride.trim() === '' ? null : v.productNameOverride.trim(),
      companyNameOverride: v.companyNameOverride.trim() === '' ? null : v.companyNameOverride.trim(),
      alertBelowPrice,
      alertAbovePrice,
      emailAlertsEnabled: v.emailAlertsEnabled,
    };
    this.http.patch<Tracking>(`${environment.apiUrl}/trackings/${id}`, body).subscribe({
      next: () => {
        this.savingEdit.set(false);
        this.editingId.set(null);
        this.load();
      },
      error: (e) => {
        this.savingEdit.set(false);
        this.patchError.set(this.messageFromApiError(e, 'dashboard.errors.saveFailed'));
      },
    });
  }

  refresh(id: string) {
    this.refreshingId.set(id);
    this.refreshError.set(null);
    this.http.post(`${environment.apiUrl}/trackings/${id}/refresh`, {}).subscribe({
      next: () => {
        this.refreshingId.set(null);
        this.load();
      },
      error: (e) => {
        this.refreshingId.set(null);
        this.refreshError.set(this.messageFromApiError(e, 'dashboard.errors.refreshFailed'));
      },
    });
  }

  remove(id: string) {
    if (!confirm(this.translate.instant('dashboard.deleteConfirm'))) return;
    this.http.delete(`${environment.apiUrl}/trackings/${id}`).subscribe({
      next: () => this.load(),
    });
  }
}
