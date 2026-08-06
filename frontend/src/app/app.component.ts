import { CommonModule } from '@angular/common';
import { afterNextRender, Component, ElementRef, inject, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { filter, map, merge, of } from 'rxjs';
import { CookieConsentComponent } from './components/cookie-consent.component';
import { LandingChromeFooterComponent } from './components/landing-chrome-footer.component';
import { LandingChromeHeaderComponent } from './components/landing-chrome-header.component';
import { MobileBottomNavComponent } from './components/mobile-bottom-nav.component';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    TranslatePipe,
    CookieConsentComponent,
    MobileBottomNavComponent,
    LandingChromeHeaderComponent,
    LandingChromeFooterComponent,
  ],
  template: `
    <div class="flex min-h-[100dvh] flex-col bg-background text-on-surface">
      <app-landing-chrome-header />
      <main
        class="flex-1 pt-[4.5rem] md:pt-24"
        [ngClass]="{
          'pb-28 md:pb-16': needsWideBottomPadding(),
          'pb-8 md:pb-12': !needsWideBottomPadding(),
        }"
      >
        <router-outlet />
      </main>
      <app-landing-chrome-footer />
      @if (isHomeRoute() && !auth.isLoggedIn()) {
        <div
          class="fixed bottom-0 left-0 z-40 w-full bg-gradient-to-t from-background from-60% to-transparent p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden"
        >
          <a
            routerLink="/register"
            class="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-surface-container-high py-3.5 font-headline text-sm font-semibold text-on-surface shadow-xl backdrop-blur-md active:scale-[0.99]"
          >
            <span class="material-symbols-outlined text-primary">bolt</span>
            {{ 'home.stickyCta' | translate }}
          </a>
        </div>
      }
      <app-mobile-bottom-nav />
      <app-cookie-consent />
    </div>
  `,
})
export class AppComponent implements OnInit {
  protected auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Home: sticky CTA on mobile. */
  protected isHomeRoute = toSignal(
    merge(
      of(null),
      this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)),
    ).pipe(map(() => this.snapshotIsHome())),
    { initialValue: this.snapshotIsHome() },
  );

  /** Room for mobile bottom nav (dashboard/pricing/shops) or home sticky CTA. */
  protected needsWideBottomPadding = toSignal(
    merge(
      of(null),
      this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)),
    ).pipe(map(() => this.snapshotNeedsWideBottomPadding())),
    { initialValue: this.snapshotNeedsWideBottomPadding() },
  );

  private snapshotIsHome(): boolean {
    const path = this.router.url.split('?')[0].split('#')[0];
    return path === '' || path === '/';
  }

  private snapshotNeedsWideBottomPadding(): boolean {
    const path = this.router.url.split('?')[0].split('#')[0];
    if (path === '' || path === '/') return true;
    if (path === '/shops') return true;
    if (path.startsWith('/dashboard')) return true;
    if (path === '/pricing') return true;
    return false;
  }

  constructor() {
    afterNextRender(() => this.host.nativeElement.removeAttribute('ng-version'));
  }

  ngOnInit() {
    if (this.auth.isLoggedIn()) {
      this.auth.loadProfile().subscribe({ error: () => {} });
    }
  }
}
