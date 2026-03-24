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
    <div class="wrap">
      <h1>{{ 'pricing.title' | translate }}</h1>
      <p class="lead">
        {{ 'pricing.lead' | translate }}
      </p>

      <div class="grid">
        <article class="card">
          <h2>{{ 'pricing.freeTitle' | translate }}</h2>
          <p class="price">€0</p>
          <ul>
            <li>{{ 'pricing.free1' | translate }}</li>
            <li>{{ 'pricing.free2' | translate }}</li>
            <li>{{ 'pricing.free3' | translate }}</li>
          </ul>
          @if (!auth.isLoggedIn()) {
            <a class="btn secondary" routerLink="/register">{{ 'pricing.getStarted' | translate }}</a>
          } @else {
            <a class="btn secondary" routerLink="/dashboard">{{ 'pricing.goDashboard' | translate }}</a>
          }
        </article>

        <article class="card featured">
          <h2>{{ 'pricing.proTitle' | translate }}</h2>
          @if (proPlan()) {
            <p class="price">
              {{ (proPlan()!.priceCents / 100) | number: '1.2-2' }} {{ proPlan()!.currency }}
              {{ 'pricing.perYear' | translate }}
            </p>
            <p class="muted">{{ proPlan()!.description }}</p>
          }
          <ul>
            <li>{{ 'pricing.pro1' | translate }}</li>
            <li>{{ 'pricing.pro2' | translate }}</li>
            <li>{{ 'pricing.pro3' | translate }}</li>
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
            @if (!paypalReady() && paypalClientConfigured()) {
              <p class="muted small">{{ 'pricing.loadingPaypal' | translate }}</p>
            }
            @if (!paypalClientConfigured()) {
              <p class="muted small">
                {{ 'pricing.paypalConfigHint' | translate }}
              </p>
            }
          }
        </article>
      </div>
    </div>
  `,
  styles: [
    `
      .wrap {
        max-width: 900px;
        margin: 0 auto;
        padding: 2rem 1rem 4rem;
      }
      h1 {
        font-size: 2rem;
        margin: 0 0 0.5rem;
      }
      .lead {
        color: var(--muted);
        margin-bottom: 2rem;
        line-height: 1.5;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 1.25rem;
        align-items: stretch;
      }
      .card {
        background: var(--card);
        border-radius: 14px;
        padding: 1.5rem;
        box-shadow: var(--shadow);
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .featured {
        border: 1px solid var(--accent);
      }
      h2 {
        margin: 0;
        font-size: 1.25rem;
      }
      .price {
        font-size: 1.75rem;
        font-weight: 700;
        margin: 0;
      }
      .muted {
        color: var(--muted);
        font-size: 0.9rem;
      }
      ul {
        margin: 0;
        padding-left: 1.1rem;
        flex: 1;
        line-height: 1.6;
      }
      .btn {
        display: inline-block;
        text-align: center;
        padding: 0.65rem 1rem;
        border-radius: 8px;
        font-weight: 600;
        text-decoration: none;
        border: none;
        cursor: pointer;
        width: 100%;
      }
      .btn.secondary {
        background: var(--accent);
        color: #fff;
      }
      .btn.danger {
        background: transparent;
        color: #f87171;
        border: 1px solid rgba(248, 113, 113, 0.5);
      }
      .hint {
        font-size: 0.9rem;
        color: var(--muted);
      }
      .ok {
        color: #4ade80;
        margin: 0;
      }
      .paypal-host {
        min-height: 48px;
      }
      .small {
        font-size: 0.8rem;
      }
      code {
        font-size: 0.75rem;
      }
    `,
  ],
})
export class PricingComponent implements AfterViewInit, OnDestroy {
  proPlan = signal<Plan | null>(null);
  paypalReady = signal(false);
  cancelling = signal(false);

  paypalHost = viewChild<ElementRef<HTMLDivElement>>('paypalHost');

  private paypalSdk: { Buttons: (opts: unknown) => { render: (s: string) => Promise<void> } } | null =
    null;

  private http = inject(HttpClient);
  private translate = inject(TranslateService);

  constructor(protected auth: AuthService) {}

  paypalClientConfigured(): boolean {
    const id = environment.paypalClientId;
    return !!id && !id.startsWith('__');
  }

  ngAfterViewInit() {
    if (this.auth.isLoggedIn()) {
      this.auth.loadProfile().subscribe({ error: () => {} });
    }

    this.http.get<Plan[]>(`${environment.apiUrl}/plans`).subscribe({
      next: (plans) => {
        const pro = plans.find((p) => p.slug === 'pro-yearly') ?? null;
        this.proPlan.set(pro);
        this.scheduleRender();
      },
    });

    const clientId = environment.paypalClientId;
    if (!clientId || clientId.startsWith('__')) return;

    void loadScript({
      clientId,
      vault: true,
      intent: 'subscription',
    }).then((sdk) => {
      this.paypalSdk = sdk as typeof this.paypalSdk;
      this.scheduleRender();
    });
  }

  ngOnDestroy() {
    const host = this.paypalHost()?.nativeElement;
    if (host) host.innerHTML = '';
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
          style: { shape: 'rect', color: 'blue', layout: 'vertical', label: 'subscribe' },
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
    } catch {
      this.paypalReady.set(false);
    }
  }

  cancel() {
    if (!confirm(this.translate.instant('pricing.cancelConfirm'))) return;
    this.cancelling.set(true);
    this.http.post(`${environment.apiUrl}/paypal/cancel`, {}).subscribe({
      next: () => {
        this.cancelling.set(false);
        this.auth.loadProfile().subscribe({ error: () => {} });
      },
      error: () => this.cancelling.set(false),
    });
  }
}
