import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/** Compact site footer: legal/pricing links + copyright (brand lives in header). */
@Component({
  selector: 'app-landing-chrome-footer',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  template: `
    <footer class="border-t border-outline-variant/15 bg-background px-4 py-4 md:px-8 md:py-3">
      <div
        class="mx-auto flex max-w-7xl flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:gap-3 sm:text-left"
      >
        <nav class="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-on-surface-variant sm:justify-start md:text-sm">
          <a routerLink="/imprint" class="transition hover:text-primary hover:underline">{{
            'common.imprint' | translate
          }}</a>
          <a routerLink="/gdpr" class="transition hover:text-primary hover:underline">{{ 'common.gdpr' | translate }}</a>
          <a routerLink="/fair-use" class="transition hover:text-primary hover:underline">{{
            'nav.fairUse' | translate
          }}</a>
          <a routerLink="/terms" class="transition hover:text-primary hover:underline">{{ 'footerTerms' | translate }}</a>
          <a routerLink="/pricing" class="transition hover:text-primary hover:underline">{{ 'nav.pricing' | translate }}</a>
        </nav>
        <p class="text-[11px] leading-tight text-outline sm:shrink-0 md:text-xs">{{ 'home.footer.copy' | translate }}</p>
      </div>
    </footer>
  `,
})
export class LandingChromeFooterComponent {}
