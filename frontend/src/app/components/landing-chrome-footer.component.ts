import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/** Same footer as the marketing home page (+ fair-use link kept from the old global footer). */
@Component({
  selector: 'app-landing-chrome-footer',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  template: `
    <footer class="border-t border-outline-variant/15 bg-background px-4 py-10 md:px-8">
      <div
        class="mx-auto flex max-w-7xl flex-col items-center gap-6 text-center md:flex-row md:justify-between md:text-left"
      >
        <span class="font-headline text-lg font-bold text-primary">{{ 'app.brand' | translate }}</span>
        <div class="flex flex-wrap justify-center gap-6 text-sm text-on-surface-variant md:justify-end">
          <a routerLink="/imprint" class="transition hover:text-primary hover:underline">{{
            'common.imprint' | translate
          }}</a>
          <a routerLink="/gdpr" class="transition hover:text-primary hover:underline">{{ 'common.gdpr' | translate }}</a>
          <a routerLink="/fair-use" class="transition hover:text-primary hover:underline">{{
            'nav.fairUse' | translate
          }}</a>
          <a routerLink="/terms" class="transition hover:text-primary hover:underline">{{ 'footerTerms' | translate }}</a>
          <a routerLink="/pricing" class="transition hover:text-primary hover:underline">{{ 'nav.pricing' | translate }}</a>
        </div>
        <p class="text-xs text-outline md:shrink-0">{{ 'home.footer.copy' | translate }}</p>
      </div>
    </footer>
  `,
})
export class LandingChromeFooterComponent {}
