import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../core/auth.service';
import { DashboardUiService } from '../core/dashboard-ui.service';
import { PwaInstallService } from '../core/pwa-install.service';

/** Logged-in mobile nav: dashboard, pricing, alerts, install — shown on dashboard + pricing routes. */
@Component({
  selector: 'app-mobile-bottom-nav',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, TranslatePipe],
  template: `
    @if (auth.isLoggedIn() && showBar()) {
      <nav
        class="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between border-t border-outline-variant/10 bg-background/95 px-6 py-1.5 backdrop-blur-xl md:hidden"
      >
        <a
          routerLink="/dashboard"
          routerLinkActive="text-primary"
          [routerLinkActiveOptions]="{ exact: false }"
          class="flex flex-col items-center gap-0.5 text-on-surface-variant/50"
        >
          <span
            class="material-symbols-outlined text-[20px]"
            [class.nav-dash-fill]="isDashboardActive()"
            >dashboard</span
          >
          <span class="text-[8px] font-bold uppercase tracking-widest">{{ 'dashboard.bottomDash' | translate }}</span>
        </a>
        <a
          routerLink="/pricing"
          routerLinkActive="text-primary"
          [routerLinkActiveOptions]="{ exact: true }"
          class="flex flex-col items-center gap-0.5 text-on-surface-variant/50"
        >
          <span class="material-symbols-outlined text-[20px]">payments</span>
          <span class="text-[8px] font-bold uppercase tracking-widest">{{ 'dashboard.bottomPricing' | translate }}</span>
        </a>
        <button
          type="button"
          (click)="onAlertsTap()"
          class="flex flex-col items-center gap-0.5 text-on-surface-variant/50"
        >
          <span class="material-symbols-outlined text-[20px]">notifications_active</span>
          <span class="text-[8px] font-bold uppercase tracking-widest">{{ 'dashboard.bottomAlerts' | translate }}</span>
        </button>
        <button
          type="button"
          (click)="onInstallTap()"
          class="flex flex-col items-center gap-0.5 text-on-surface-variant/50"
        >
          <span class="material-symbols-outlined text-[20px]">install_mobile</span>
          <span class="text-[8px] font-bold uppercase tracking-widest">{{ 'nav.installApp' | translate }}</span>
        </button>
      </nav>
    }
  `,
  styles: [
    `
      .nav-dash-fill {
        font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20;
      }
    `,
  ],
})
export class MobileBottomNavComponent {
  protected auth = inject(AuthService);
  private router = inject(Router);
  private dashboardUi = inject(DashboardUiService);
  private pwa = inject(PwaInstallService);
  private translate = inject(TranslateService);

  showBar(): boolean {
    const u = this.router.url.split('?')[0];
    return u === '/dashboard' || u === '/pricing';
  }

  isDashboardActive(): boolean {
    return this.router.url.startsWith('/dashboard');
  }

  onAlertsTap(): void {
    if (this.router.url.startsWith('/dashboard')) {
      this.dashboardUi.requestToggleNotifications();
    } else {
      void this.router.navigate(['/dashboard'], { queryParams: { notifs: '1' } });
    }
  }

  async onInstallTap(): Promise<void> {
    if (this.pwa.showInstallEntry()) {
      await this.pwa.promptInstall();
      return;
    }
    window.alert(this.translate.instant('pwa.browserHint'));
  }
}
