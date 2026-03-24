import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, RouterLink],
  template: `
    <div class="shell">
      <header class="top">
        <a routerLink="/" class="brand">Simple Price Tracker</a>
        <nav>
          <a routerLink="/pricing">Pricing</a>
          @if (auth.isLoggedIn()) {
            <a routerLink="/dashboard">Dashboard</a>
            <button type="button" class="link" (click)="auth.logout()">Sign out</button>
          } @else {
            <a routerLink="/login">Sign in</a>
            <a routerLink="/register" class="cta">Register</a>
          }
        </nav>
      </header>
      <main>
        <router-outlet />
      </main>
    </div>
  `,
  styles: [
    `
      .shell {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }
      .top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.85rem 1.5rem;
        border-bottom: 1px solid var(--border);
        background: var(--card);
      }
      .brand {
        font-weight: 700;
        text-decoration: none;
        color: var(--text);
        letter-spacing: -0.02em;
      }
      nav {
        display: flex;
        align-items: center;
        gap: 1rem;
        font-size: 0.95rem;
      }
      nav a {
        color: var(--muted);
        text-decoration: none;
      }
      nav a:hover {
        color: var(--text);
      }
      .cta {
        background: var(--accent);
        color: #fff !important;
        padding: 0.35rem 0.75rem;
        border-radius: 8px;
      }
      .link {
        background: none;
        border: none;
        color: var(--muted);
        font: inherit;
        cursor: pointer;
      }
      .link:hover {
        color: var(--text);
      }
      main {
        flex: 1;
      }
    `,
  ],
})
export class AppComponent implements OnInit {
  constructor(protected auth: AuthService) {}

  ngOnInit() {
    if (this.auth.isLoggedIn()) {
      this.auth.loadProfile().subscribe({ error: () => {} });
    }
  }
}
