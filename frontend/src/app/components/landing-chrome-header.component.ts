import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../core/auth.service';

/** Same top bar as the marketing home page; auth-aware links for dashboard / sign-out. */
@Component({
  selector: 'app-landing-chrome-header',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  template: `
    <nav
      class="landing-nav-blur fixed top-0 z-50 flex w-full items-center justify-between border-b border-outline-variant/10 bg-background/70 px-4 py-3 backdrop-blur-xl md:px-8 md:py-4"
    >
      <a
        routerLink="/"
        class="font-headline text-xl font-extrabold tracking-tight text-primary md:text-2xl"
        >{{ 'app.brand' | translate }}</a
      >
      <div class="flex items-center gap-3 md:gap-5">
        @if (!auth.isLoggedIn()) {
          <a
            routerLink="/"
            fragment="how-it-works"
            class="hidden text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface md:inline"
            >{{ 'home.nav.how' | translate }}</a
          >
        }
        <a
          routerLink="/pricing"
          class="hidden text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface md:inline"
          >{{ 'nav.pricing' | translate }}</a
        >
        <a
          routerLink="/shops"
          class="hidden text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface md:inline"
          >{{ 'nav.shops' | translate }}</a
        >
        @if (auth.isLoggedIn()) {
          <a
            routerLink="/dashboard"
            class="hidden text-sm font-medium text-on-surface-variant transition-colors hover:text-on-surface md:inline"
            >{{ 'nav.dashboard' | translate }}</a
          >
          <button
            type="button"
            (click)="auth.logout()"
            class="text-sm font-medium text-on-surface-variant transition-colors hover:text-primary"
          >
            {{ 'nav.signOut' | translate }}
          </button>
        } @else {
          <a routerLink="/login" class="text-sm font-medium text-on-surface-variant hover:text-primary">{{
            'nav.signIn' | translate
          }}</a>
          <a
            routerLink="/register"
            class="primary-gradient rounded-xl px-3 py-2 font-headline text-sm font-bold text-on-primary-container shadow-md transition hover:brightness-110 active:scale-[0.98] md:px-5 md:py-2.5"
            >{{ 'home.nav.cta' | translate }}</a
          >
        }
      </div>
    </nav>
  `,
})
export class LandingChromeHeaderComponent {
  protected auth = inject(AuthService);
}
