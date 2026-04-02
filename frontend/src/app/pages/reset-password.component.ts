import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../core/auth.service';

function passwordsMatch(c: AbstractControl): ValidationErrors | null {
  const p = c.get('password')?.value;
  const c2 = c.get('confirm')?.value;
  if (p == null || c2 == null || p === c2) return null;
  return { mismatch: true };
}

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="card">
      <h1>{{ 'resetPassword.title' | translate }}</h1>
      @if (missingToken()) {
        <p class="err">{{ 'resetPassword.missingToken' | translate }}</p>
        <p class="muted"><a routerLink="/forgot-password">{{ 'resetPassword.requestNew' | translate }}</a></p>
      } @else if (success()) {
        <p class="ok">{{ 'resetPassword.success' | translate }}</p>
      } @else if (error()) {
        <p class="err">{{ error() }}</p>
        <p class="muted"><a routerLink="/forgot-password">{{ 'resetPassword.requestNew' | translate }}</a></p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()">
          <label>{{ 'resetPassword.password' | translate }}</label>
          <input type="password" formControlName="password" autocomplete="new-password" />
          <label>{{ 'resetPassword.confirm' | translate }}</label>
          <input type="password" formControlName="confirm" autocomplete="new-password" />
          @if (form.hasError('mismatch') && (form.touched || form.dirty)) {
            <p class="err">{{ 'resetPassword.mismatch' | translate }}</p>
          }
          @if (form.controls.password.hasError('minlength') && form.controls.password.touched) {
            <p class="err">{{ 'resetPassword.minLength' | translate }}</p>
          }
          <button type="submit" [disabled]="form.invalid || saving()">
            {{ saving() ? ('resetPassword.saving' | translate) : ('resetPassword.submit' | translate) }}
          </button>
        </form>
        <p class="muted"><a routerLink="/login">{{ 'resetPassword.backLogin' | translate }}</a></p>
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
        margin: 0 0 1.25rem;
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
      .ok {
        color: #4ade80;
        font-size: 0.95rem;
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
export class ResetPasswordComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private translate = inject(TranslateService);

  token = '';
  missingToken = signal(false);
  success = signal(false);
  error = signal<string | null>(null);
  saving = signal(false);

  form = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirm: ['', [Validators.required]],
    },
    { validators: passwordsMatch },
  );

  ngOnInit() {
    const t = this.route.snapshot.queryParamMap.get('token');
    if (!t?.trim()) {
      this.missingToken.set(true);
      return;
    }
    this.token = t.trim();
  }

  submit() {
    if (this.form.invalid || !this.token) return;
    this.saving.set(true);
    this.error.set(null);
    const password = this.form.controls.password.value;
    this.auth.resetPassword(this.token, password).subscribe({
      next: () => {
        this.saving.set(false);
        this.success.set(true);
        void this.auth.loadProfile().subscribe({
          next: () => void this.router.navigate(['/dashboard']),
          error: () => void this.router.navigate(['/dashboard']),
        });
      },
      error: (e: { error?: { code?: string; message?: string } }) => {
        this.saving.set(false);
        if (e.error?.code === 'INVALID_OR_EXPIRED_TOKEN') {
          this.error.set(this.translate.instant('resetPassword.invalidToken'));
        } else if (typeof e.error?.message === 'string') {
          this.error.set(e.error.message);
        } else {
          this.error.set(this.translate.instant('resetPassword.failed'));
        }
      },
    });
  }
}
