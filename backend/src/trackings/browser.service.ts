import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Browser, BrowserContext, Page } from 'playwright-core';

const IDLE_CLOSE_MS = 5 * 60_000;
const PAGE_TIMEOUT_MS = 25_000;

/**
 * Manages a singleton headless Chromium instance for rendering JS-heavy pages.
 * Used as a fallback when the simple HTTP fetch finds no structured price data.
 *
 * - Lazy launch: Chromium starts only on first request
 * - Auto-close: shuts down after 5 min of inactivity
 * - Sequential: one page at a time (mutex) to keep RAM ~150-250 MB
 * - Stealth patches: hides navigator.webdriver and other headless tells
 */
@Injectable()
export class BrowserService implements OnModuleDestroy {
  private readonly log = new Logger(BrowserService.name);
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private launching: Promise<Browser> | null = null;
  private mutex: Promise<void> = Promise.resolve();

  async onModuleDestroy() {
    await this.closeBrowser();
  }

  async fetchRenderedHtml(url: string): Promise<string> {
    return this.withMutex(async () => {
      const ctx = await this.getContext();
      const page = await ctx.newPage();
      try {
        await this.applyStealthScripts(page);
        const mindfactory = this.isMindfactoryHost(url);
        const notebooksbilliger = this.isNotebooksbilligerHost(url);
        await page.goto(url, {
          waitUntil: 'load',
          timeout: PAGE_TIMEOUT_MS,
          referer: mindfactory
            ? 'https://www.mindfactory.de/'
            : notebooksbilliger
              ? 'https://www.notebooksbilliger.de/'
              : undefined,
        });
        await page
          .waitForLoadState('networkidle', { timeout: 8_000 })
          .catch(() => {});

        if (notebooksbilliger) {
          await page
            .waitForSelector(
              [
                '.product-price__regular',
                '.nbb-product-price__main',
                '[itemprop="price"]',
                'script[type="application/ld+json"]',
                '[class*="product-price"]',
                '[class*="ProductPrice"]',
              ].join(', '),
              { timeout: 14_000 },
            )
            .catch(() => {});
          await page.waitForTimeout(1_500);
        }

        if (mindfactory) {
          await this.dismissMindfactorySecurityGate(page);
          await page
            .waitForSelector(
              '#bProductInfo .pprice, #bProductInfo span.pprice, span[itemprop="price"], script[type="application/ld+json"]',
              { timeout: 12_000 },
            )
            .catch(() => {});
          await page.waitForTimeout(1_200);
        }

        // Some sites (Amazon) serve a JS challenge that resolves after a few
        // seconds. If the page is suspiciously small after networkidle, poll
        // briefly to wait for the real content to appear.
        let html = await page.content();
        if (html.length < 20_000) {
          for (let i = 0; i < 3; i++) {
            await page.waitForTimeout(3_000);
            html = await page.content();
            if (html.length >= 20_000) break;
          }
        }

        await this.dismissConsentDialogs(page);
        await page.waitForTimeout(1_000);
        return await page.content();
      } finally {
        await page.close().catch(() => {});
        this.resetIdleTimer();
      }
    });
  }

  /** Patch common headless browser detection vectors before navigation. */
  private async applyStealthScripts(page: Page) {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['de-DE', 'de', 'en-US', 'en'],
      });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      (window as any).chrome = { runtime: {} };
    });
  }

  private isMindfactoryHost(url: string): boolean {
    try {
      const h = new URL(url).hostname.toLowerCase();
      return h === 'mindfactory.de' || h === 'www.mindfactory.de';
    } catch {
      return false;
    }
  }

  private isNotebooksbilligerHost(url: string): boolean {
    try {
      const h = new URL(url).hostname.toLowerCase();
      return h === 'notebooksbilliger.de' || h === 'www.notebooksbilliger.de';
    } catch {
      return false;
    }
  }

  /**
   * Mindfactory often shows an interstitial ("SICHERHEITSCHECK" / "Ich bin ein Mensch")
   * before the product page. Try to click through; Turnstile-style gates may still block.
   */
  private async dismissMindfactorySecurityGate(page: Page) {
    for (let round = 0; round < 5; round++) {
      const html = await page.content();
      if (html.includes('Datenbank-Updates')) {
        this.log.warn('Mindfactory maintenance page — cannot load product');
        return;
      }
      const gate =
        html.includes('SICHERHEITSCHECK') ||
        html.includes('Ich bin ein Mensch') ||
        (html.length < 6_000 && html.includes('mindfactory'));
      if (!gate) return;

      const selectors = [
        'button:has-text("Ich bin ein Mensch")',
        'a:has-text("Ich bin ein Mensch")',
        'input[type="submit"][value*="Mensch"]',
        'input[type="button"][value*="Mensch"]',
      ];
      let clicked = false;
      for (const sel of selectors) {
        try {
          const loc = page.locator(sel).first();
          if (await loc.isVisible({ timeout: 700 })) {
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'load', timeout: 22_000 }).catch(() => {}),
              loc.click({ timeout: 4_000 }),
            ]);
            clicked = true;
            await page.waitForTimeout(1_500);
            await page
              .waitForLoadState('networkidle', { timeout: 10_000 })
              .catch(() => {});
            break;
          }
        } catch {
          /* try next selector */
        }
      }
      if (!clicked) await page.waitForTimeout(2_000);
    }
  }

  /** Try to click away common cookie/consent overlays (German + international). */
  private async dismissConsentDialogs(page: Page) {
    const selectors = [
      // Usercentrics (MediaMarkt, Saturn, Hornbach, etc.)
      '[data-testid="uc-accept-all-button"]',
      '#uc-btn-accept-banner',
      // OneTrust (many large retailers)
      '#onetrust-accept-btn-handler',
      // Cookiebot
      '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
      '#CybotCookiebotDialogBodyButtonAccept',
      // Didomi (Zalando, etc.)
      '#didomi-notice-agree-button',
      // Quantcast / TCF
      '.qc-cmp2-summary-buttons button[mode="primary"]',
      // Generic German patterns
      'button[data-cookie-accept]',
      '[data-action="accept-all"]',
      '[data-action="save-accept-all"]',
      'button[id*="accept"]',
      'button[class*="consent"]',
      'button[class*="cookie"]',
      'button[class*="Cookie"]',
      '.js-accept-cookies',
      '.cookie-accept-all',
      '.cc-accept',
      '.cc-btn.cc-allow',
      // "Alle akzeptieren" / "Alles akzeptieren" text-based fallback
      'button:has-text("Alle akzeptieren")',
      'button:has-text("Alles akzeptieren")',
      'button:has-text("Alle Cookies akzeptieren")',
      'button:has-text("Accept all")',
      'button:has-text("Akzeptieren")',
      // Shadow DOM consent banners (Truendo, etc.)
      '.cmp-accept-all',
    ];
    for (const sel of selectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 300 })) {
          await btn.click({ timeout: 1_000 });
          await page.waitForTimeout(500);
          return;
        }
      } catch {
        /* not found — try next */
      }
    }
  }

  private async withMutex<T>(fn: () => Promise<T>): Promise<T> {
    let release: () => void;
    const next = new Promise<void>((r) => (release = r));
    const prev = this.mutex;
    this.mutex = next;
    await prev;
    try {
      return await fn();
    } finally {
      release!();
    }
  }

  private async getContext(): Promise<BrowserContext> {
    if (this.context) return this.context;
    const browser = await this.ensureBrowser();
    this.context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'de-DE',
      viewport: { width: 1920, height: 1080 },
      extraHTTPHeaders: {
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    return this.context;
  }

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    if (this.launching) return this.launching;

    this.launching = this.launchBrowser();
    try {
      this.browser = await this.launching;
      return this.browser;
    } finally {
      this.launching = null;
    }
  }

  private async launchBrowser(): Promise<Browser> {
    this.log.log('Launching headless Chromium…');
    const { chromium } = await import('playwright-core');

    const execPath = this.findChromiumPath();
    const browser = await chromium.launch({
      executablePath: execPath ?? undefined,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    browser.on('disconnected', () => {
      this.log.warn('Chromium disconnected');
      this.browser = null;
      this.context = null;
    });

    this.log.log('Chromium ready');
    this.resetIdleTimer();
    return browser;
  }

  private findChromiumPath(): string | null {
    const envPath = process.env['CHROMIUM_PATH'];
    if (envPath) return envPath;

    const candidates =
      process.platform === 'win32'
        ? [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            `${process.env['LOCALAPPDATA']}\\Google\\Chrome\\Application\\chrome.exe`,
          ]
        : [
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
          ];

    try {
      const { existsSync } = require('fs');
      for (const p of candidates) {
        if (existsSync(p)) return p;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  private resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.closeBrowser(), IDLE_CLOSE_MS);
  }

  private async closeBrowser() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      this.log.log('Closing idle Chromium');
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}
