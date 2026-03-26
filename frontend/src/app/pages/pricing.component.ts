import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { loadScript } from '@paypal/paypal-js';
import { AuthService } from '../core/auth.service';
import { environment } from '../../environments/environment';

type Plan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceCents: number;
  currency: string;
  paypalPlanId: string;
  maxTrackings: number | null;
  sortOrder: number;
};

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  template: `
    <div class="wrap" [class.wrap--nav-pad]="auth.isLoggedIn()">
      <h1>{{ 'pricing.title' | translate }}</h1>

      <div class="grid">
        <article class="card card-free">
          <div class="card-shine" aria-hidden="true"></div>
          <div class="card-inner">
            <h2 class="card-title">{{ 'pricing.freeTitle' | translate }}</h2>
            <p class="price-block">
              <span class="price-currency">€</span><span class="price-amount">0</span>
            </p>
            <p class="price-caption">{{ 'pricing.freeCaption' | translate }}</p>
            <ul class="feature-list">
              <li>{{ 'pricing.free1' | translate }}</li>
              <li>{{ 'pricing.free2' | translate }}</li>
              <li>{{ 'pricing.free4' | translate }}</li>
            </ul>
            @if (!auth.isLoggedIn()) {
              <a class="btn btn-free" routerLink="/register">{{ 'pricing.getStarted' | translate }}</a>
            }
          </div>
        </article>

        <article class="card card-pro">
          <div class="card-pro-glow" aria-hidden="true"></div>
          <div class="card-inner">
            <div class="pro-eyebrow">{{ 'pricing.proEyebrow' | translate }}</div>
            <h2 class="card-title">{{ 'pricing.proTitle' | translate }}</h2>
            <p class="price-block">
              <span class="price-amount">{{ (proUiMonthlyNetCents / 100) | number: '1.2-2' }}</span>
              <span class="price-currency-suffix"> EUR</span>
            </p>
            <p class="price-caption">{{ 'pricing.proPerMonth' | translate }}</p>
            <p class="muted small vat-line">{{ 'pricing.proVatNote' | translate }}</p>
            <ul class="feature-list">
              <li>{{ 'pricing.pro1' | translate }}</li>
              <li>{{ 'pricing.pro2' | translate }}</li>
              <li>{{ 'pricing.pro3' | translate }}</li>
              <li>{{ 'pricing.pro4' | translate }}</li>
              <li>{{ 'pricing.pro5' | translate }}</li>
              <li>{{ 'pricing.pro6' | translate }}</li>
            </ul>
            @if (!auth.isLoggedIn()) {
              <p class="hint">
                <a routerLink="/login">{{ 'nav.signIn' | translate }}</a
                >{{ 'pricing.afterSignInToSubscribe' | translate }}
              </p>
            } @else if (auth.user()?.planTier === 'PRO') {
              <p class="ok">{{ 'pricing.onPro' | translate }}</p>
              <button type="button" class="btn danger" (click)="cancel()" [disabled]="cancelling()">
                {{ 'pricing.cancelSub' | translate }}
              </button>
            } @else {
              <div #paypalHost class="paypal-host"></div>
            }
          </div>
        </article>
      </div>
    </div>
  `,
  styles: [
    `
      .wrap {
        max-width: 960px;
        margin: 0 auto;
        padding: 2rem 1rem 4rem;
      }
      @media (max-width: 767px) {
        .wrap.wrap--nav-pad {
          padding-bottom: 6rem;
        }
      }
      h1 {
        font-size: 2rem;
        margin: 0 0 1.75rem;
        letter-spacing: -0.02em;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 1.5rem;
        align-items: stretch;
      }
      .card {
        position: relative;
        border-radius: 20px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-height: 100%;
        border: 1px solid rgba(173, 198, 255, 0.12);
        background: linear-gradient(
          160deg,
          rgba(30, 40, 68, 0.95) 0%,
          rgba(18, 24, 42, 0.98) 45%,
          rgba(14, 18, 32, 1) 100%
        );
        box-shadow:
          0 4px 24px rgba(0, 0, 0, 0.35),
          inset 0 1px 0 rgba(255, 255, 255, 0.04);
      }
      .card-free .card-shine {
        position: absolute;
        inset: 0;
        background: radial-gradient(ellipse 80% 50% at 10% -20%, rgba(173, 198, 255, 0.14), transparent 55%);
        pointer-events: none;
      }
      .card-free::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background: linear-gradient(180deg, #c8d9ff, #7c9cff 50%, rgba(124, 156, 255, 0.35));
        border-radius: 20px 0 0 20px;
      }
      .card-pro {
        border-color: rgba(124, 156, 255, 0.35);
        box-shadow:
          0 0 0 1px rgba(124, 156, 255, 0.12),
          0 12px 48px rgba(45, 78, 180, 0.18),
          0 4px 24px rgba(0, 0, 0, 0.35),
          inset 0 1px 0 rgba(255, 255, 255, 0.06);
      }
      .card-pro-glow {
        position: absolute;
        inset: -40%;
        background: radial-gradient(circle at 50% 0%, rgba(124, 156, 255, 0.22), transparent 55%);
        pointer-events: none;
      }
      .card-inner {
        position: relative;
        z-index: 1;
        padding: 1.6rem 1.5rem 1.5rem 1.65rem;
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        flex: 1;
      }
      .card-free .card-inner {
        padding-left: 1.35rem;
      }
      .pro-eyebrow {
        align-self: flex-start;
        font-size: 0.65rem;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #9eb7ff;
        background: rgba(124, 156, 255, 0.12);
        border: 1px solid rgba(124, 156, 255, 0.28);
        padding: 0.35rem 0.65rem;
        border-radius: 999px;
      }
      .card-title {
        margin: 0;
        font-size: 1.35rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: var(--text, #dae2fd);
      }
      .price-block {
        margin: 0.15rem 0 0;
        font-size: 2.35rem;
        font-weight: 800;
        line-height: 1.1;
        letter-spacing: -0.03em;
        color: #f0f4ff;
      }
      .card-free .price-currency {
        font-size: 1.5rem;
        font-weight: 700;
        opacity: 0.85;
        margin-right: 0.15rem;
        vertical-align: super;
      }
      .card-free .price-amount {
        font-size: 2.5rem;
      }
      .price-caption {
        margin: 0;
        font-size: 0.9rem;
        color: #a8b4d4;
        font-weight: 500;
      }
      .vat-line {
        margin: 0;
      }
      .muted {
        color: #9aa3b8;
        font-size: 0.9rem;
      }
      .feature-list {
        margin: 0.5rem 0 0;
        padding: 0;
        list-style: none;
        flex: 1;
        line-height: 1.55;
        font-size: 0.9rem;
        color: #c8d0e4;
      }
      .feature-list li {
        position: relative;
        padding-left: 1.35rem;
        margin-bottom: 0.5rem;
      }
      .feature-list li::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0.55em;
        width: 0.4rem;
        height: 0.4rem;
        border-radius: 50%;
        background: linear-gradient(135deg, #8ab4ff, #adc6ff);
        box-shadow: 0 0 10px rgba(124, 156, 255, 0.45);
      }
      .btn {
        display: inline-block;
        text-align: center;
        padding: 0.75rem 1rem;
        border-radius: 12px;
        font-weight: 700;
        text-decoration: none;
        border: none;
        cursor: pointer;
        width: 100%;
        margin-top: auto;
        transition:
          transform 0.15s ease,
          box-shadow 0.15s ease,
          filter 0.15s ease;
      }
      .btn-free {
        margin-top: 1rem;
        background: linear-gradient(135deg, rgba(124, 156, 255, 0.22), rgba(173, 198, 255, 0.1));
        color: #e8edff;
        border: 1px solid rgba(173, 198, 255, 0.35);
        box-shadow: 0 2px 12px rgba(45, 78, 180, 0.12);
      }
      .btn-free:hover {
        filter: brightness(1.08);
        box-shadow: 0 4px 20px rgba(124, 156, 255, 0.2);
        transform: translateY(-1px);
      }
      .btn.danger {
        background: transparent;
        color: #f87171;
        border: 1px solid rgba(248, 113, 113, 0.5);
        margin-top: 0.5rem;
      }
      .hint {
        font-size: 0.9rem;
        color: var(--muted);
        margin: 0.25rem 0 0;
      }
      .ok {
        color: #4ade80;
        margin: 0.25rem 0 0;
        font-weight: 600;
      }
      .paypal-host {
        min-height: 52px;
        margin-top: 0.35rem;
      }
      .paypal-skeleton {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: 0.35rem;
      }
      .skeleton-btn {
        height: 44px;
        border-radius: 12px;
        background: rgba(124, 156, 255, 0.08);
        border: 1px solid rgba(173, 198, 255, 0.1);
      }
      .skeleton-btn-short {
        height: 40px;
      }
      .shimmer {
        position: relative;
        overflow: hidden;
      }
      .shimmer::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(173, 198, 255, 0.06) 40%,
          rgba(173, 198, 255, 0.1) 50%,
          rgba(173, 198, 255, 0.06) 60%,
          transparent 100%
        );
        animation: shimmer 1.8s ease-in-out infinite;
      }
      @keyframes shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
      .paypal-error {
        color: #f87171;
        font-size: 0.85rem;
        margin: 0.35rem 0 0;
        padding: 0.6rem 0.8rem;
        background: rgba(248, 113, 113, 0.08);
        border: 1px solid rgba(248, 113, 113, 0.2);
        border-radius: 10px;
      }
      .small {
        font-size: 0.8rem;
      }
    `,
  ],
})
export class PricingComponent implements AfterViewInit, OnDestroy {
  /**
   * Monthly net in cents (3.99 EUR). Keep aligned with backend seed / migration; UI uses this so stale DB rows cannot skew display.
   */
  protected readonly proUiMonthlyNetCents = 399;

  private static readonly PAYPAL_TIMEOUT_MS = 15_000;

  proPlan = signal<Plan | null>(null);
  paypalReady = signal(false);
  paypalError = signal('');
  cancelling = signal(false);
  private paypalClientId = signal('');
  private loadTimer: ReturnType<typeof setTimeout> | null = null;

  paypalHost = viewChild<ElementRef<HTMLDivElement>>('paypalHost');

  private paypalSdk: { Buttons: (opts: unknown) => { render: (s: string) => Promise<void> } } | null =
    null;

  private http = inject(HttpClient);
  private translate = inject(TranslateService);

  constructor(protected auth: AuthService) {}

  ngAfterViewInit() {
    if (this.auth.isLoggedIn()) {
      this.auth.loadProfile().subscribe({ error: () => {} });
    }

    if (this.auth.isLoggedIn() && this.auth.user()?.planTier !== 'PRO') {
      this.startLoadTimeout();
    }

    this.http.get<Plan[]>(`${environment.apiUrl}/plans`).subscribe({
      next: (plans) => {
        const pro =
          plans.find((p) => p.slug === 'pro-monthly' || p.slug === 'pro-yearly') ?? null;
        this.proPlan.set(pro);
        this.scheduleRender();
      },
      error: () => this.handleLoadFailure('Plans API unreachable'),
    });

    this.http.get<{ clientId: string }>(`${environment.apiUrl}/paypal/config`).subscribe({
      next: ({ clientId }) => {
        if (!clientId) {
          this.handleLoadFailure('PayPal client ID is empty');
          return;
        }
        this.paypalClientId.set(clientId);
        void loadScript({ clientId, vault: true, intent: 'subscription' })
          .then((sdk) => {
            this.paypalSdk = sdk as typeof this.paypalSdk;
            this.scheduleRender();
          })
          .catch((err) => this.handleLoadFailure(`PayPal SDK failed: ${err}`));
      },
      error: () => this.handleLoadFailure('PayPal config API unreachable'),
    });
  }

  ngOnDestroy() {
    this.clearLoadTimeout();
    const host = this.paypalHost()?.nativeElement;
    if (host) host.innerHTML = '';
  }

  private startLoadTimeout() {
    this.loadTimer = setTimeout(() => {
      if (!this.paypalReady() && !this.paypalError()) {
        this.handleLoadFailure('Timeout — PayPal buttons did not load');
      }
    }, PricingComponent.PAYPAL_TIMEOUT_MS);
  }

  private clearLoadTimeout() {
    if (this.loadTimer) {
      clearTimeout(this.loadTimer);
      this.loadTimer = null;
    }
  }

  private handleLoadFailure(reason: string) {
    console.error('[Pricing]', reason);
    this.paypalError.set(reason);
    this.clearLoadTimeout();
  }

  private scheduleRender() {
    setTimeout(() => void this.tryRenderPaypal(), 0);
  }

  private async tryRenderPaypal() {
    const plan = this.proPlan();
    const paypal = this.paypalSdk;
    const host = this.paypalHost()?.nativeElement;
    if (!plan?.paypalPlanId || !paypal?.Buttons || !host) return;
    if (!this.auth.isLoggedIn() || this.auth.user()?.planTier === 'PRO') return;

    host.innerHTML = '';
    this.paypalReady.set(false);

    const hostId = `pp-sub-${Date.now()}`;
    host.id = hostId;

    try {
      await paypal
        .Buttons({
          style: {
            color: 'silver',
            shape: 'rect',
            layout: 'vertical',
            label: 'subscribe',
            borderRadius: 12,
            tagline: false,
          },
          createSubscription: (
            _data: unknown,
            actions: { subscription: { create: (o: unknown) => Promise<string> } },
          ) => {
            return actions.subscription.create({
              plan_id: plan.paypalPlanId,
            });
          },
          onApprove: async (data: { subscriptionID?: string }) => {
            if (!data.subscriptionID) return;
            await new Promise<void>((resolve, reject) => {
              this.http
                .post(`${environment.apiUrl}/paypal/activate`, { subscriptionId: data.subscriptionID })
                .subscribe({
                  next: () => {
                    this.auth.loadProfile().subscribe({ error: () => {} });
                    resolve();
                  },
                  error: reject,
                });
            });
          },
        })
        .render(`#${hostId}`);
      this.paypalReady.set(true);
      this.clearLoadTimeout();
    } catch (err) {
      this.handleLoadFailure(`PayPal render failed: ${err}`);
    }
  }

  cancel() {
    if (!confirm(this.translate.instant('pricing.cancelConfirm'))) return;
    this.cancelling.set(true);
    this.http.post(`${environment.apiUrl}/paypal/cancel`, {}).subscribe({
      next: () => {
        this.cancelling.set(false);
        this.auth.loadProfile().subscribe({
          next: () => {
            this.paypalReady.set(false);
            this.paypalError.set('');
            this.startLoadTimeout();
            // Small delay so Angular renders the #paypalHost div first
            setTimeout(() => this.scheduleRender(), 50);
          },
          error: () => {},
        });
      },
      error: () => this.cancelling.set(false),
    });
  }
}
