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
    <div class="card">
      @if (pendingEmail(); as pe) {
        <h1>{{ 'register.verifyPendingTitle' | translate }}</h1>
        <p class="info">{{ 'register.verifyPendingBody' | translate: { email: pe } }}</p>
        @if (resendHint()) {
          <p class="muted">{{ 'register.resendSent' | translate }}</p>
        }
        @if (resendErr()) {
          <p class="err">{{ resendErr() }}</p>
        }
        <button type="button" class="secondary" [disabled]="resendBusy()" (click)="resend(pe)">
          {{ 'register.resend' | translate }}
        </button>
        <p class="muted"><a routerLink="/login">{{ 'register.hasAccount' | translate }}</a></p>
      } @else {
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
  pendingEmail = signal<string | null>(null);
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
    this.auth.register(email, password, acceptTerms).subscribe({
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

  resend(email: string) {
    this.resendBusy.set(true);
    this.resendErr.set(null);
    this.resendHint.set(false);
    this.auth.resendVerification(email).subscribe({
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
