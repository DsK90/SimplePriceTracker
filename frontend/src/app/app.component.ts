import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from './core/auth.service';
import { PwaInstallService } from './core/pwa-install.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe],
  template: `
    <div class="min-h-screen flex flex-col bg-background text-on-background">
      <nav
        class="fixed top-0 z-50 w-full border-b border-outline-variant/10 bg-background/80 backdrop-blur-md"
      >
        <div
          class="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-3 font-headline md:px-8 md:py-4"
        >
          <div class="flex min-w-0 shrink flex-col gap-0.5">
            <a
              routerLink="/"
              class="text-lg font-black italic tracking-tighter text-primary md:text-xl"
              >Pricefly</a
            >
            <p class="text-xs leading-snug text-on-surface-variant/90 md:text-sm">
              Track prices. Get notified instantly.
            </p>
          </div>
          <div class="hidden items-center gap-6 text-sm md:flex">
            @if (auth.isLoggedIn()) {
              <a
                routerLink="/dashboard"
                routerLinkActive="border-b-2 border-primary pb-0.5 text-primary"
                [routerLinkActiveOptions]="{ exact: false }"
                class="text-on-surface-variant transition-colors hover:text-on-surface"
                >{{ 'nav.dashboard' | translate }}</a
              >
            }
            <a
              routerLink="/pricing"
              routerLinkActive="border-b-2 border-primary pb-0.5 text-primary"
              class="text-on-surface-variant transition-colors hover:text-on-surface"
              >{{ 'nav.pricing' | translate }}</a
            >
          </div>
          <div class="flex items-center gap-3 md:gap-4">
            @if (auth.isLoggedIn()) {
              <button
                type="button"
                (click)="auth.logout()"
                class="text-xs text-on-surface-variant transition-colors hover:text-primary md:text-sm"
              >
                Sign out
              </button>
              <div
                class="h-7 w-7 overflow-hidden rounded-full border border-outline-variant/30 bg-surface-container-highest md:h-8 md:w-8"
              >
                <span
                  class="flex h-full w-full items-center justify-center text-[10px] font-bold text-on-secondary-container"
                  >{{ userInitial() }}</span
                >
              </div>
            } @else {
              <a
                routerLink="/login"
                class="text-xs text-on-surface-variant transition-colors hover:text-primary md:text-sm"
                >{{ 'nav.signIn' | translate }}</a
              >
              <a
                routerLink="/register"
                class="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary transition hover:brightness-110 md:text-sm"
                >{{ 'nav.register' | translate }}</a
              >
            }
          </div>
        </div>
      </nav>
      <!-- pt must clear fixed nav: brand + tagline is taller than old single-line bar -->
      <main class="flex-1 pt-[5.75rem] sm:pt-24 md:pt-28">
        <router-outlet />
      </main>
    </div>
  `,
})
export class AppComponent implements OnInit {
  protected auth = inject(AuthService);
  protected pwa = inject(PwaInstallService);

  ngOnInit() {
    if (this.auth.isLoggedIn()) {
      this.auth.loadProfile().subscribe({ error: () => {} });
    }
  }

  userInitial(): string {
    const e = this.auth.user()?.email;
    if (e && e.length) return e[0]!.toUpperCase();
    return '?';
  }
}
