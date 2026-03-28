import { CommonModule } from '@angular/common';
import { afterNextRender, Component, ElementRef, inject, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CookieConsentComponent } from './components/cookie-consent.component';
import { MobileBottomNavComponent } from './components/mobile-bottom-nav.component';
import { AuthService } from './core/auth.service';
import { PwaInstallService } from './core/pwa-install.service';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TranslatePipe,
    CookieConsentComponent,
    MobileBottomNavComponent,
  ],
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
              >{{ 'app.brand' | translate }}</a
            >
            <p class="text-xs leading-snug text-on-surface-variant/90 md:text-sm">
              {{ 'app.tagline' | translate }}
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
                {{ 'nav.signOut' | translate }}
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
      <footer
        class="border-t border-outline-variant/10 bg-surface-container-low/30 pt-px pb-12 md:pb-px"
      >
        <div
          class="mx-auto flex max-w-[1440px] flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-4 text-xs text-on-surface-variant md:px-8"
        >
          <a routerLink="/imprint" class="hover:text-primary hover:underline">{{ 'common.imprint' | translate }}</a>
          <span aria-hidden="true" class="text-on-surface-variant/50">·</span>
          <a routerLink="/gdpr" class="hover:text-primary hover:underline">{{ 'common.gdpr' | translate }}</a>
          <span aria-hidden="true" class="text-on-surface-variant/50">·</span>
          <a routerLink="/fair-use" class="hover:text-primary hover:underline">{{ 'nav.fairUse' | translate }}</a>
          <span aria-hidden="true" class="text-on-surface-variant/50">·</span>
          <a routerLink="/terms" class="hover:text-primary hover:underline">{{ 'footerTerms' | translate }}</a>
        </div>
      </footer>
      <app-mobile-bottom-nav />
      <app-cookie-consent />
    </div>
  `,
})
export class AppComponent implements OnInit {
  protected auth = inject(AuthService);
  protected pwa = inject(PwaInstallService);
  private readonly host = inject(ElementRef<HTMLElement>);

  constructor() {
    afterNextRender(() => this.host.nativeElement.removeAttribute('ng-version'));
  }

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
