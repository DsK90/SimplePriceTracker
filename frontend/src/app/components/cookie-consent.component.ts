import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CookieConsentService } from '../core/cookie-consent.service';

@Component({
  selector: 'app-cookie-consent',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  template: `
    @if (visible()) {
      <div
        class="fixed bottom-0 left-0 right-0 z-[100] border-t border-outline-variant/20 bg-surface-container-low/95 px-4 py-4 shadow-[0_-8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md md:px-8"
        role="dialog"
        aria-labelledby="cookie-consent-title"
      >
        <div
          class="mx-auto flex max-w-[1440px] flex-col gap-4 md:flex-row md:items-center md:justify-between"
        >
          <div class="min-w-0 flex-1 text-sm text-on-surface/90">
            <h2 id="cookie-consent-title" class="font-headline text-base font-bold text-on-surface">
              {{ 'cookies.title' | translate }}
            </h2>
            <p class="mt-1 leading-relaxed">{{ 'cookies.message' | translate }}</p>
            <p class="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-on-surface-variant">
              <a routerLink="/gdpr" class="text-primary hover:underline">{{ 'common.gdpr' | translate }}</a>
              <span aria-hidden="true">·</span>
              <a routerLink="/imprint" class="text-primary hover:underline">{{ 'common.imprint' | translate }}</a>
              <span aria-hidden="true">·</span>
              <a routerLink="/fair-use" class="text-primary hover:underline">{{ 'nav.fairUse' | translate }}</a>
            </p>
          </div>
          <div class="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              (click)="onEssential()"
              class="rounded-lg border border-outline-variant/40 px-4 py-2.5 text-sm font-semibold text-on-surface transition hover:bg-surface-container-highest"
            >
              {{ 'cookies.essential' | translate }}
            </button>
            <button
              type="button"
              (click)="onAcceptAll()"
              class="rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-on-primary transition hover:brightness-110"
            >
              {{ 'cookies.acceptAll' | translate }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class CookieConsentComponent implements OnInit {
  private readonly consent = inject(CookieConsentService);
  protected visible = signal(false);

  ngOnInit(): void {
    if (this.consent.hasAnswered()) return;
    setTimeout(() => this.visible.set(true), 800);
  }

  onEssential(): void {
    this.consent.acceptEssential();
    this.visible.set(false);
  }

  onAcceptAll(): void {
    this.consent.acceptAll();
    this.visible.set(false);
  }
}
