import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';

const ACCEPT_KEY = 'pricefly-cookie-consent';
const TYPE_KEY = 'pricefly-cookie-consent-type';

export type CookieConsentType = 'all' | 'essential';

@Injectable({ providedIn: 'root' })
export class CookieConsentService {
  hasAnswered(): boolean {
    return localStorage.getItem(ACCEPT_KEY) === 'true';
  }

  consentType(): CookieConsentType | null {
    const t = localStorage.getItem(TYPE_KEY);
    if (t === 'all' || t === 'essential') return t;
    return null;
  }

  acceptAll(): void {
    localStorage.setItem(ACCEPT_KEY, 'true');
    localStorage.setItem(TYPE_KEY, 'all');
    this.injectUmami();
  }

  acceptEssential(): void {
    localStorage.setItem(ACCEPT_KEY, 'true');
    localStorage.setItem(TYPE_KEY, 'essential');
  }

  /** Call on app init: load analytics if the user previously chose “Accept all”. */
  loadUmamiIfConsented(): void {
    if (this.consentType() !== 'all') return;
    this.injectUmami();
  }

  private injectUmami(): void {
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
