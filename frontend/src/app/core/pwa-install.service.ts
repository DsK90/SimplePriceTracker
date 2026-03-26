import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

/** Chromium-only; not in default TypeScript lib. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Captures Chromium `beforeinstallprompt` and triggers the add-to-home-screen flow. */
@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private translate = inject(TranslateService);
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  /** True after `beforeinstallprompt` (Chromium) — native install sheet available. */
  readonly canInstall = signal(false);

  /** Already running as installed PWA or iOS “Add to Home Screen” web app. */
  readonly isStandalone = signal(false);

  constructor() {
    if (typeof window === 'undefined') return;

    this.isStandalone.set(this.computeStandalone());

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.canInstall.set(true);
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.canInstall.set(false);
      this.isStandalone.set(true);
    });
  }

  /** iPad / iPhone / iPod (no `beforeinstallprompt` — user must use Share → Add to Home Screen). */
  isIOS(): boolean {
    if (typeof navigator === 'undefined') return false;
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  }

  /** Show install entry: Chromium prompt available, or iOS where we show manual steps. */
  showInstallEntry(): boolean {
    if (this.isStandalone()) return false;
    return this.canInstall() || this.isIOS();
  }

  async promptInstall(): Promise<void> {
    if (this.isStandalone()) return;

    if (this.isIOS()) {
      window.alert(this.translate.instant('pwa.iosHint'));
      return;
    }

    if (!this.deferredPrompt) {
      window.alert(this.translate.instant('pwa.browserHint'));
      return;
    }

    await this.deferredPrompt.prompt();
    await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    this.canInstall.set(false);
  }

  private computeStandalone(): boolean {
    const mm = window.matchMedia('(display-mode: standalone)');
    if (mm.matches) return true;
    return (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  }
}
