import { inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

export const SUPPORTED_LANGS = ['en', 'de', 'da', 'ru', 'zh', 'es', 'it', 'fr'] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

/** Map browser language → supported code (e.g. zh-CN → zh). */
export function resolveBrowserLang(): SupportedLang {
  if (typeof navigator === 'undefined') return 'en';
  const raw = navigator.language || (navigator as unknown as { userLanguage?: string }).userLanguage || 'en';
  const primary = raw.split('-')[0].toLowerCase();
  if (primary === 'zh') return 'zh';
  return (SUPPORTED_LANGS as readonly string[]).includes(primary) ? (primary as SupportedLang) : 'en';
}

/** Runs in injection context (e.g. `provideAppInitializer(i18nInitializer)`). */
export function i18nInitializer(): Promise<void> {
  const translate = inject(TranslateService);
  const lang = resolveBrowserLang();
  translate.addLangs([...SUPPORTED_LANGS]);
  translate.setFallbackLang('en');
  return firstValueFrom(translate.use(lang)).then(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
    const title = translate.instant('app.pageTitle');
    if (typeof document !== 'undefined' && title && title !== 'app.pageTitle') {
      document.title = title;
    }
  });
}
