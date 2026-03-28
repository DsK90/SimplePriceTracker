import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { take } from 'rxjs/operators';
import { AuthService } from '../core/auth.service';

function apiErrorCode(e: unknown): string | undefined {
  const err = e as { error?: Record<string, unknown> };
  const b = err?.error;
  if (!b || typeof b !== 'object') return undefined;
  const c = b['code'];
  return typeof c === 'string' ? c : undefined;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe],
  template: `
    @if (verificationModalOpen()) {
      <div
        class="verify-overlay"
        role="presentation"
        (click)="closeVerificationModal(true)"
      ></div>
      <div
        class="verify-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="verify-modal-title"
        aria-describedby="verify-modal-desc"
      >
        <h2 id="verify-modal-title" class="verify-modal-title">
          {{ 'login.verificationModalTitle' | translate }}
        </h2>
        <p id="verify-modal-desc" class="verify-modal-body">
          {{ 'login.verificationModalBody' | translate }}
        </p>
        <p class="verify-modal-hint">{{ 'login.verificationModalHint' | translate }}</p>
        <button
          type="button"
          class="verify-modal-primary"
          [disabled]="resendBusy() || form.controls.email.invalid"
          (click)="resend()"
        >
          {{ 'login.resendVerification' | translate }}
        </button>
        <button type="button" class="verify-modal-close" (click)="closeVerificationModal(true)">
          {{ 'login.verificationModalClose' | translate }}
        </button>
      </div>
    }

    <div class="card">
      <h1>{{ 'login.title' | translate }}</h1>

      @if (verificationBanner()) {
        <div class="verify-banner" role="status">
          <strong>{{ 'login.verificationBannerTitle' | translate }}</strong>
          <p>{{ 'login.verificationBannerBody' | translate }}</p>
        </div>
      }

      <form [formGroup]="form" (ngSubmit)="submit()">
        <label>{{ 'login.email' | translate }}</label>
        <input type="email" formControlName="email" autocomplete="email" />
        <label>{{ 'login.password' | translate }}</label>
        <input type="password" formControlName="password" autocomplete="current-password" />
        @if (error()) {
          <p class="err" role="alert">{{ error() }}</p>
        }
        @if (showResend() && !verificationModalOpen()) {
          <button
            type="button"
            class="secondary"
            [disabled]="resendBusy() || form.controls.email.invalid"
            (click)="resend()"
          >
            {{ 'login.resendVerification' | translate }}
          </button>
        }
        <button type="submit" [disabled]="form.invalid || loading()">{{ 'login.submit' | translate }}</button>
      </form>
      <p class="muted"><a routerLink="/register">{{ 'login.createAccount' | translate }}</a></p>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 400px;
        margin: 3rem auto;
        position: relative;
      }
      .verify-overlay {
        position: fixed;
        inset: 0;
        z-index: 1000;
        background: rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(2px);
      }
      .verify-modal {
        position: fixed;
        z-index: 1001;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: calc(100vw - 2rem);
        max-width: 420px;
        background: var(--card);
        border-radius: 16px;
        padding: 1.5rem 1.35rem;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
        border: 1px solid var(--border);
      }
      .verify-modal-title {
        margin: 0 0 0.75rem;
        font-size: 1.2rem;
        line-height: 1.35;
        color: var(--text);
      }
      .verify-modal-body,
      .verify-modal-hint {
        margin: 0 0 0.65rem;
        font-size: 0.92rem;
        line-height: 1.5;
        color: var(--muted);
      }
      .verify-modal-hint {
        font-size: 0.85rem;
        opacity: 0.95;
      }
      .verify-modal-primary {
        margin-top: 0.5rem;
        width: 100%;
        padding: 0.7rem;
        border: none;
        border-radius: 10px;
        background: var(--accent);
        color: #fff;
        font-weight: 600;
        cursor: pointer;
      }
      .verify-modal-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .verify-modal-close {
        margin-top: 0.65rem;
        width: 100%;
        padding: 0.55rem;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: transparent;
        color: var(--muted);
        font-weight: 500;
        cursor: pointer;
      }
      .verify-banner {
        margin-bottom: 1rem;
        padding: 0.85rem 1rem;
        border-radius: 10px;
        border-left: 4px solid var(--accent);
        background: color-mix(in srgb, var(--accent) 12%, var(--card));
        font-size: 0.88rem;
        line-height: 1.45;
        color: var(--text);
      }
      .verify-banner strong {
        display: block;
        margin-bottom: 0.35rem;
        font-size: 0.95rem;
      }
      .verify-banner p {
        margin: 0;
        color: var(--muted);
      }
      .card {
        background: var(--card);
        border-radius: 12px;
        padding: 2rem;
        box-shadow: var(--shadow);
      }
      h1 {
        margin: 0 0 1.5rem;
        font-size: 1.5rem;
      }
      label {
        display: block;
        margin-top: 0.75rem;
        font-size: 0.85rem;
        color: var(--muted);
      }
      input {
        width: 100%;
        margin-top: 0.25rem;
        padding: 0.5rem 0.65rem;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--text);
      }
      button {
        margin-top: 1.25rem;
        width: 100%;
        padding: 0.65rem;
        border: none;
        border-radius: 8px;
        background: var(--accent);
        color: #fff;
        font-weight: 600;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .err {
        color: #f87171;
        margin-top: 0.75rem;
        font-size: 0.9rem;
      }
      .muted {
        margin-top: 1rem;
        font-size: 0.9rem;
        color: var(--muted);
      }
      a {
        color: var(--accent);
      }
      button.secondary {
        margin-top: 0.75rem;
        width: 100%;
        padding: 0.55rem;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--card);
        color: var(--text);
        font-weight: 500;
        cursor: pointer;
      }
      button.secondary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
  ],
})
export class LoginComponent implements OnInit {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private translate = inject(TranslateService);

  loading = signal(false);
  error = signal<string | null>(null);
  showResend = signal(false);
  resendBusy = signal(false);
  verificationModalOpen = signal(false);
  verificationBanner = signal(false);

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  ngOnInit() {
    this.route.queryParams.pipe(take(1)).subscribe((q) => {
      if (q['pendingVerification'] === '1' || q['needVerify'] === '1') {
        this.verificationModalOpen.set(true);
      }
    });
  }

  closeVerificationModal(showBanner: boolean) {
    this.verificationModalOpen.set(false);
    if (showBanner) {
      this.verificationBanner.set(true);
    }
  }

  submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    this.showResend.set(false);
    this.verificationBanner.set(false);
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => {
        this.loading.set(false);
        this.verificationModalOpen.set(false);
        void this.auth.loadProfile().subscribe({
          next: () => void this.router.navigate(['/dashboard']),
          error: () => void this.router.navigate(['/dashboard']),
        });
      },
      error: (e) => {
        this.loading.set(false);
        const code = apiErrorCode(e);
        if (code === 'EMAIL_NOT_VERIFIED') {
          this.showResend.set(true);
          this.error.set(this.translate.instant('login.emailNotVerified'));
          this.verificationModalOpen.set(true);
          return;
        }
        const m = (e as { error?: { message?: unknown } }).error?.message;
        this.error.set(
          Array.isArray(m) ? m[0] : typeof m === 'string' ? m : this.translate.instant('login.failed'),
        );
      },
    });
  }

  resend() {
    const email = this.form.getRawValue().email;
    if (!email) return;
    this.resendBusy.set(true);
    this.auth.resendVerification(email, this.translate.getCurrentLang() || 'en').subscribe({
      next: () => {
        this.resendBusy.set(false);
        this.error.set(this.translate.instant('login.resendSent'));
      },
      error: () => {
        this.resendBusy.set(false);
        this.error.set(this.translate.instant('login.resendFailed'));
      },
    });
  }
}
