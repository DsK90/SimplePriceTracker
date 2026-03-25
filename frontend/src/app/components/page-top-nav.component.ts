import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../core/auth.service';

/** Legal / info pages: back to main app + upgrade CTA */
@Component({
  selector: 'app-page-top-nav',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  template: `
    <nav class="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-medium">
      <a
        [routerLink]="backPath()"
        class="inline-flex items-center gap-1 text-primary hover:underline"
      >
        ← {{ 'common.backToApp' | translate }}
      </a>
      @if (showUpgradeLink()) {
        <span aria-hidden="true" class="select-none text-on-surface-variant/40">·</span>
        <a routerLink="/pricing" class="text-primary hover:underline">
          {{ 'common.upgradeNow' | translate }}
        </a>
      }
    </nav>
  `,
})
export class PageTopNavComponent {
  private auth = inject(AuthService);

  backPath(): string {
    return this.auth.isLoggedIn() ? '/dashboard' : '/pricing';
  }

  /** Hide upsell when already on Pro. */
  showUpgradeLink(): boolean {
    return !this.auth.isLoggedIn() || this.auth.user()?.planTier !== 'PRO';
  }
}
