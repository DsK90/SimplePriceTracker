import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

const ACCEPT_KEY = 'pricefly-cookie-consent';
const TYPE_KEY = 'pricefly-cookie-consent-type';

export type CookieConsentType = 'all' | 'essential';

@Injectable({ providedIn: 'root' })
export class CookieConsentService {
  hasAnswered(): boolean {
    try {
      return localStorage.getItem(ACCEPT_KEY) === 'true';
    } catch {
      return false;
    }
  }

  consentType(): CookieConsentType | null {
    try {
      const t = localStorage.getItem(TYPE_KEY);
      if (t === 'all' || t === 'essential') return t;
      return null;
    } catch {
      return null;
    }
  }

  acceptAll(): void {
    try {
      localStorage.setItem(ACCEPT_KEY, 'true');
      localStorage.setItem(TYPE_KEY, 'all');
    } catch {
      /* localStorage unavailable */
    }
    this.injectUmami();
  }

  acceptEssential(): void {
    try {
      localStorage.setItem(ACCEPT_KEY, 'true');
      localStorage.setItem(TYPE_KEY, 'essential');
    } catch {
      /* localStorage unavailable */
    }
  }

  /** Call on app init: load analytics if the user previously chose “Accept all”. */
  loadUmamiIfConsented(): void {
    if (this.consentType() !== 'all') return;
    this.injectUmami();
  }

  /**
   * Same as Umami’s official embed (defer + data-website-id), appended to document.head.
   * Only runs after the user chose “Accept all” (here or on a prior visit).
   */
  private injectUmami(): void {
    if (typeof document === 'undefined') return;
    const url = environment.umamiScriptUrl?.trim();
    const id = environment.umamiWebsiteId?.trim();
    if (!url || !id) return;
    if (document.querySelector(`script[data-website-id="${CSS.escape(id)}"]`)) return;
    const s = document.createElement('script');
    s.defer = true;
    s.src = url;
    s.setAttribute('data-website-id', id);
    document.head.appendChild(s);
  }
}
