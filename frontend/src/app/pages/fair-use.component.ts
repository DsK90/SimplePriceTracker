import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-fair-use',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  template: `
    <div class="mx-auto max-w-3xl px-4 py-10 md:py-14">
      <a
        routerLink="/pricing"
        class="mb-6 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        ← {{ 'fairUse.back' | translate }}
      </a>
      <h1 class="font-headline text-2xl font-extrabold tracking-tight text-on-surface md:text-3xl">
        {{ 'fairUse.title' | translate }}
      </h1>
      <p class="mt-2 text-sm text-on-surface-variant">{{ 'fairUse.updated' | translate }}</p>
      <div class="prose prose-invert mt-8 max-w-none space-y-4 text-sm leading-relaxed text-on-surface/90">
        <p>{{ 'fairUse.p1' | translate }}</p>
        <p>{{ 'fairUse.p2' | translate }}</p>
        <p>{{ 'fairUse.p3' | translate }}</p>
        <ul class="list-disc space-y-2 pl-5">
          <li>{{ 'fairUse.li1' | translate }}</li>
          <li>{{ 'fairUse.li2' | translate }}</li>
          <li>{{ 'fairUse.li3' | translate }}</li>
        </ul>
        <p>{{ 'fairUse.p4' | translate }}</p>
      </div>
    </div>
  `,
})
export class FairUseComponent {}
