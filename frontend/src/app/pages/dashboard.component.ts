import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { BreakpointObserver } from '@angular/cdk/layout';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, HostListener, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService, UserProfile } from '../core/auth.service';
import { DashboardUiService } from '../core/dashboard-ui.service';
import { parseDecimalInput } from '../core/parse-decimal-input';
import { PushNotificationService } from '../core/push-notification.service';
import { environment } from '../../environments/environment';
import { map } from 'rxjs';

type Tracking = {
  id: string;
  url: string;
  productName: string;
  companyName: string | null;
  displayProductName: string;
  displayCompanyName: string | null;
  productNameOverride: string | null;
  companyNameOverride: string | null;
  recheckIntervalMinutes: number;
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

const INTERVAL_MINUTES = [1, 15, 30, 60, 360, 720, 1440, 10080] as const;

type ApiErrorBody = {
  code?: string;
  limit?: number;
  message?: string | string[];
};

function intervalOptionsForMin(minMinutes: number) {
  return INTERVAL_MINUTES.filter((m) => m >= minMinutes);
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, NgTemplateOutlet, TranslatePipe, DragDropModule],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  protected readonly intervalOptions = intervalOptionsForMin(environment.minRecheckIntervalMinutes);
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
    url: ['', [Validators.required]],
  });

  editForm = this.fb.nonNullable.group({
    productNameOverride: [''],
    companyNameOverride: [''],
    recheckIntervalMinutes: [360],
    alertBelowPrice: [''],
    alertAbovePrice: [''],
    emailAlertsEnabled: [false],
  });

  items = signal<Tracking[]>([]);
  profile = signal<UserProfile | null>(null);
  loading = signal(true);
  saving = signal(false);
  savingEdit = signal(false);
  refreshingId = signal<string | null>(null);
  formError = signal<string | null>(null);
  refreshError = signal<string | null>(null);
  patchError = signal<string | null>(null);
  editingId = signal<string | null>(null);

  notifications = signal<AppNotification[]>([]);
  notifCount = signal(0);
  notifOpen = signal(false);
  notifLoading = signal(false);

  demoAdding = signal(false);

  /** Pro-only: overlay with price snapshots for one tracking. */
  historyTracking = signal<Tracking | null>(null);

  pushLoading = signal(true);
  pushUnsupported = signal(false);
  pushServerOn = signal(false);
  pushSubscribed = signal(false);
  pushDenied = signal(false);
  pushBusy = signal(false);
  pushBannerDismissed = signal(false);

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
      return this.translate.instant('dashboard.errors.priceNotFound');
    }
    if (body?.code === 'EMAIL_ALERT_LIMIT') {
      return this.translate.instant('dashboard.errors.emailAlertLimit', {
        max: body.limit ?? 2,
      });
    }
    if (body?.code === 'HTTP_FETCH_ERROR') {
      return this.translate.instant('dashboard.errors.httpFetchError');
    }
    const m = body?.message;
    if (Array.isArray(m)) return m[0] ?? this.translate.instant(fallbackKey);
    if (typeof m === 'string' && m.length > 0) return m;
    return this.translate.instant(fallbackKey);
  }

  ngOnInit() {
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
      },
      error: () => {},
    });
    this.load();
    this.loadNotifCount();
    void this.initPush();
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
    return this.profile()?.planTier === 'PRO' ? 10 : 2;
  }

  protected emailAlertsUsedExcluding(trackingId: string): number {
    return this.items().filter((x) => x.emailAlertsEnabled && x.id !== trackingId).length;
  }

  protected canEnableEmailAlerts(t: Tracking): boolean {
    if (t.emailAlertsEnabled) return true;
    return this.emailAlertsUsedExcluding(t.id) < this.emailAlertMax();
  }

  intervalShort(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;
    if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
    if (minutes === 1440) return '1d';
    return `${Math.round(minutes / 1440)}d`;
  }

  protected intervalLabel(minutes: number): string {
    const key = `dashboard.interval.m${minutes}`;
    const t = this.translate.instant(key);
    if (t !== key) return t;
    return this.translate.instant('dashboard.interval.unknown', { minutes });
  }

  protected isPro(): boolean {
    return this.profile()?.planTier === 'PRO';
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
    if (this.form.invalid) return;
    this.saving.set(true);
    this.formError.set(null);
    const v = this.form.getRawValue();
    this.http.post<Tracking>(`${environment.apiUrl}/trackings`, { url: v.url }).subscribe({
      next: () => {
        this.form.reset({ url: '' });
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
      recheckIntervalMinutes: Math.max(
        environment.minRecheckIntervalMinutes,
        t.recheckIntervalMinutes,
      ),
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
      recheckIntervalMinutes: v.recheckIntervalMinutes,
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
