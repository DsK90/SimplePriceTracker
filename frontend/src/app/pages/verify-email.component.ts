import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  template: `
    <div class="card">
      <h1>{{ 'verify.title' | translate }}</h1>
      @if (working()) {
        <p class="muted">{{ 'verify.working' | translate }}</p>
      }
      @if (error()) {
        <p class="err">{{ error() }}</p>
        <p class="muted"><a routerLink="/login">{{ 'verify.goLogin' | translate }}</a></p>
      }
      @if (success()) {
        <p>{{ 'verify.success' | translate }}</p>
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
export class VerifyEmailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private auth = inject(AuthService);
  private translate = inject(TranslateService);

  working = signal(true);
  error = signal<string | null>(null);
  success = signal(false);

  ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token?.trim()) {
      this.working.set(false);
      this.error.set(this.translate.instant('verify.missingToken'));
      return;
    }
    this.auth.verifyEmail(token.trim()).subscribe({
      next: () => {
        this.working.set(false);
        this.success.set(true);
        void this.auth.loadProfile().subscribe({
          next: () => void this.router.navigate(['/dashboard']),
          error: () => void this.router.navigate(['/dashboard']),
        });
      },
      error: (e) => {
        this.working.set(false);
        const code = e.error?.code;
        if (code === 'INVALID_OR_EXPIRED_TOKEN') {
          this.error.set(this.translate.instant('verify.fail'));
        } else {
          this.error.set(
            typeof e.error?.message === 'string'
              ? e.error.message
              : this.translate.instant('verify.fail'),
          );
        }
      },
    });
  }
}
