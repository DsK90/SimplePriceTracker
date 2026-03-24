import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="card">
      <h1>Sign in</h1>
      <form [formGroup]="form" (ngSubmit)="submit()">
        <label>Email</label>
        <input type="email" formControlName="email" autocomplete="email" />
        <label>Password</label>
        <input type="password" formControlName="password" autocomplete="current-password" />
        @if (error()) {
          <p class="err">{{ error() }}</p>
        }
        <button type="submit" [disabled]="form.invalid || loading()">Sign in</button>
      </form>
      <p class="muted"><a routerLink="/register">Create an account</a></p>
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
    `,
  ],
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  loading = signal(false);
  error = signal<string | null>(null);

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => {
        this.loading.set(false);
        void this.auth.loadProfile().subscribe({
          next: () => void this.router.navigate(['/dashboard']),
          error: () => void this.router.navigate(['/dashboard']),
        });
      },
      error: (e) => {
        this.loading.set(false);
        const m = e.error?.message;
        this.error.set(Array.isArray(m) ? m[0] : m || 'Login failed');
      },
    });
  }
}
