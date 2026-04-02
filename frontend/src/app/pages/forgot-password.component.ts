import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="card">
      <h1>{{ 'forgotPassword.title' | translate }}</h1>
      <p class="lead">{{ 'forgotPassword.lead' | translate }}</p>
      @if (done()) {
        <p class="ok">{{ 'forgotPassword.sent' | translate }}</p>
        <p class="muted"><a routerLink="/login">{{ 'forgotPassword.backLogin' | translate }}</a></p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()">
          <label>{{ 'forgotPassword.email' | translate }}</label>
          <input type="email" formControlName="email" autocomplete="email" />
          @if (error()) {
            <p class="err" role="alert">{{ error() }}</p>
          }
          <button type="submit" [disabled]="form.invalid || loading()">
            {{ loading() ? ('forgotPassword.sending' | translate) : ('forgotPassword.submit' | translate) }}
          </button>
        </form>
        <p class="muted"><a routerLink="/login">{{ 'forgotPassword.backLogin' | translate }}</a></p>
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
        margin: 0 0 0.75rem;
        font-size: 1.5rem;
      }
      .lead {
        margin: 0 0 1.25rem;
        font-size: 0.92rem;
        line-height: 1.5;
        color: var(--muted);
      }
      label {
        display: block;
        margin-top: 0.5rem;
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
      .ok {
        color: #4ade80;
        font-size: 0.95rem;
        line-height: 1.5;
      }
      .muted {
        margin-top: 1rem;
        font-size: 0.9rem;
        color: var(--muted);
      }
      a {
        color: var(--accent);
      }
    `,
  ],
})
export class ForgotPasswordComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private translate = inject(TranslateService);

  loading = signal(false);
  error = signal<string | null>(null);
  done = signal(false);

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    const email = this.form.controls.email.value.trim();
    const locale = this.translate.getCurrentLang() || 'en';
    this.auth.forgotPassword(email, locale).subscribe({
      next: () => {
        this.loading.set(false);
        this.done.set(true);
      },
      error: (e: { error?: { code?: string; retryAfterSeconds?: number } }) => {
        this.loading.set(false);
        if (e.error?.code === 'RESET_COOLDOWN' && e.error.retryAfterSeconds != null) {
          this.error.set(
            this.translate.instant('forgotPassword.cooldown', {
              seconds: e.error.retryAfterSeconds,
            }),
          );
        } else {
          this.error.set(this.translate.instant('forgotPassword.failed'));
        }
      },
    });
  }
}
