import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe],
  template: `
    <!-- ===== VERIFICATION MODAL (blocks everything until user clicks "Got it") ===== -->
    @if (pendingEmail() && !modalDismissed()) {
      <div class="verify-overlay"></div>
      <div
        class="verify-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="verify-modal-title"
        aria-describedby="verify-modal-desc"
      >
        <h2 id="verify-modal-title" class="verify-modal-title">
          {{ 'register.verificationModalTitle' | translate }}
        </h2>
        <p id="verify-modal-desc" class="verify-modal-body">
          {{ 'register.verificationModalBody' | translate: { email: pendingEmail() } }}
        </p>
        <p class="verify-modal-hint">{{ 'register.verificationModalHint' | translate }}</p>
        @if (resendHint()) {
          <p class="verify-modal-sent">{{ 'register.resendSent' | translate }}</p>
        }
        @if (resendErr()) {
          <p class="err">{{ resendErr() }}</p>
        }
        <button
          type="button"
          class="verify-modal-primary"
          [disabled]="resendBusy()"
          (click)="resend(pendingEmail()!)"
        >
          {{ 'register.verificationModalResend' | translate }}
        </button>
        <button type="button" class="verify-modal-close" (click)="dismissModal()">
          {{ 'register.verificationModalClose' | translate }}
        </button>
      </div>
    }

    <div class="card">
      <!-- ===== AFTER MODAL DISMISSED: permanent inline block replaces the form ===== -->
      @if (pendingEmail(); as pe) {
        <div class="verify-callout" role="alert" aria-live="assertive">
          <strong>{{ 'register.verifyAlertTitle' | translate }}</strong>
          <p>{{ 'register.verifyAlertBody' | translate }}</p>
        </div>
        <h1>{{ 'register.verifyPendingTitle' | translate }}</h1>
        <p class="info">{{ 'register.verifyPendingBody' | translate: { email: pe } }}</p>
        @if (resendHint()) {
          <p class="verify-inline-sent">{{ 'register.resendSent' | translate }}</p>
        }
        @if (resendErr()) {
          <p class="err">{{ resendErr() }}</p>
        }
        <button type="button" class="secondary" [disabled]="resendBusy()" (click)="resend(pe)">
          {{ 'register.resend' | translate }}
        </button>
        <p class="muted">
          <a routerLink="/login" [queryParams]="{ pendingVerification: '1' }">{{ 'register.hasAccount' | translate }}</a>
        </p>
      } @else {
        <!-- ===== REGISTRATION FORM ===== -->
        <h1>{{ 'register.title' | translate }}</h1>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <label>{{ 'register.email' | translate }}</label>
          <input type="email" formControlName="email" autocomplete="email" />
          <label>{{ 'register.password' | translate }}</label>
          <input type="password" formControlName="password" autocomplete="new-password" />
          <label class="terms-row">
            <input type="checkbox" formControlName="acceptTerms" />
            <span class="terms-label">
              {{ 'register.acceptTermsStart' | translate }}
              <a routerLink="/terms" target="_blank" rel="noopener noreferrer">{{ 'register.termsDoc' | translate }}</a>
              {{ 'register.acceptTermsMiddle' | translate }}
              <a routerLink="/gdpr" target="_blank" rel="noopener noreferrer">{{ 'register.privacyDoc' | translate }}</a>
              {{ 'register.acceptTermsEnd' | translate }}
            </span>
          </label>
          @if (form.controls.acceptTerms.touched && form.controls.acceptTerms.invalid) {
            <p class="err">{{ 'register.acceptTermsRequired' | translate }}</p>
          }
          @if (error()) {
            <p class="err">{{ error() }}</p>
          }
          <button type="submit" [disabled]="form.invalid || loading()">{{ 'register.submit' | translate }}</button>
        </form>
        <p class="muted"><a routerLink="/login">{{ 'register.hasAccount' | translate }}</a></p>
      }
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

      /* ── Modal overlay: NO click handler, cannot be dismissed by tapping outside ── */
      .verify-overlay {
        position: fixed;
        inset: 0;
        z-index: 10000;
        background: rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(2px);
        /* pointer-events: auto is default; overlay simply blocks everything beneath */
      }
      .verify-modal {
        position: fixed;
        z-index: 10001;
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
      .verify-modal-sent {
        margin: 0 0 0.5rem;
        font-size: 0.85rem;
        color: var(--accent);
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

      /* ── Inline verification block (shown after modal is dismissed) ── */
      .verify-callout {
        margin-bottom: 1.25rem;
        padding: 1rem 1.1rem;
        border-radius: 12px;
        border-left: 4px solid var(--accent);
        background: color-mix(in srgb, var(--accent) 14%, var(--card));
        font-size: 0.9rem;
        line-height: 1.45;
      }
      .verify-callout strong {
        display: block;
        margin-bottom: 0.4rem;
        font-size: 1rem;
        color: var(--text);
      }
      .verify-callout p {
        margin: 0;
        color: var(--muted);
      }
      .verify-inline-sent {
        margin-top: 0.5rem;
        font-size: 0.85rem;
        color: var(--accent);
      }

      /* ── Form card ── */
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
      .info {
        line-height: 1.5;
        color: var(--text);
        margin-top: 0.5rem;
      }
      button.secondary {
        margin-top: 1rem;
        background: var(--border);
        color: var(--text);
      }
      .terms-row {
        display: flex;
        gap: 0.6rem;
        align-items: flex-start;
        margin-top: 1rem;
        font-size: 0.85rem;
        line-height: 1.45;
        color: var(--muted);
        cursor: pointer;
      }
      .terms-row input {
        width: auto;
        margin-top: 0.2rem;
        flex-shrink: 0;
      }
      .terms-label a {
        text-decoration: underline;
      }
    `,
  ],
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private translate = inject(TranslateService);

  loading = signal(false);
  error = signal<string | null>(null);

  /** Set once on successful registration when verification is required. Never cleared. */
  pendingEmail = signal<string | null>(null);
  /** Only set to true when user explicitly clicks "Got it" in the modal. */
  modalDismissed = signal(false);

  resendBusy = signal(false);
  resendHint = signal(false);
  resendErr = signal<string | null>(null);

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    acceptTerms: [false, Validators.requiredTrue],
  });

  submit() {
    if (this.form.invalid) {
      this.form.controls.acceptTerms.markAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const { email, password, acceptTerms } = this.form.getRawValue();
    this.auth.register(email, password, acceptTerms, this.translate.getCurrentLang() || 'en').subscribe({
      next: (r) => {
        this.loading.set(false);
        if ('verificationRequired' in r && r.verificationRequired) {
          this.pendingEmail.set(r.email);
          return;
        }
        void this.auth.loadProfile().subscribe({
          next: () => void this.router.navigate(['/dashboard']),
          error: () => void this.router.navigate(['/dashboard']),
        });
      },
      error: (e) => {
        this.loading.set(false);
        if (e.error?.code === 'EMAIL_VERIFICATION_UNAVAILABLE') {
          this.error.set(this.translate.instant('register.serviceUnavailable'));
          return;
        }
        this.error.set(
          Array.isArray(e.error?.message)
            ? e.error.message[0]
            : e.error?.message || this.translate.instant('register.failed'),
        );
      },
    });
  }

  dismissModal() {
    this.modalDismissed.set(true);
  }

  resend(email: string) {
    this.resendBusy.set(true);
    this.resendErr.set(null);
    this.resendHint.set(false);
    this.auth.resendVerification(email, this.translate.getCurrentLang() || 'en').subscribe({
      next: () => {
        this.resendBusy.set(false);
        this.resendHint.set(true);
      },
      error: () => {
        this.resendBusy.set(false);
        this.resendErr.set(this.translate.instant('register.resendFailed'));
      },
    });
  }
}
