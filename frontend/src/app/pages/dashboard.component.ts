import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService, UserProfile } from '../core/auth.service';
import { environment } from '../../environments/environment';

type Tracking = {
  id: string;
  url: string;
  productName: string;
  companyName: string | null;
  displayProductName: string;
  displayCompanyName: string | null;
  productNameOverride: string | null;
  companyNameOverride: string | null;
  recheckIntervalMinutes: number;
  alertBelowPrice: string | null;
  alertAbovePrice: string | null;
  lastPrice: string | null;
  currency: string;
  lastCheckedAt: string | null;
  active: boolean;
  createdAt: string;
};

type AppNotification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  trackingId: string | null;
};

const ALL_INTERVAL_OPTIONS: { label: string; minutes: number }[] = [
  { label: 'Every minute', minutes: 1 },
  { label: 'Every 15 minutes', minutes: 15 },
  { label: 'Every 30 minutes', minutes: 30 },
  { label: 'Every hour', minutes: 60 },
  { label: 'Every 6 hours', minutes: 360 },
  { label: 'Every 12 hours', minutes: 720 },
  { label: 'Daily', minutes: 1440 },
  { label: 'Weekly', minutes: 10080 },
];

function intervalOptionsForMin(minMinutes: number) {
  return ALL_INTERVAL_OPTIONS.filter((o) => o.minutes >= minMinutes);
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="wrap">
      <header class="head">
        <div>
          <h1>Trackings</h1>
          <p class="muted">
            @if (profile()?.planTier === 'PRO') {
              Pro — unlimited active items
            } @else {
              Free — up to 5 active trackings.
              <a routerLink="/pricing">Upgrade</a>
            }
          </p>
        </div>
        <div class="head-actions">
          <button type="button" class="ghost notif-btn" (click)="toggleNotifs()">
            Notifications
            @if (notifCount() > 0) {
              <span class="badge">{{ notifCount() }}</span>
            }
          </button>
          <button type="button" class="ghost" (click)="logout()">Sign out</button>
        </div>
      </header>

      @if (notifOpen()) {
        <section class="card notif-panel">
          <div class="notif-head">
            <h2>Notifications</h2>
            @if (notifCount() > 0) {
              <button type="button" class="small ghost" (click)="markAllRead()">Mark all read</button>
            }
          </div>
          @if (notifLoading()) {
            <p class="muted">Loading…</p>
          } @else if (!notifications().length) {
            <p class="muted">No notifications yet. Price alerts appear here.</p>
          } @else {
            <ul class="notif-list">
              @for (n of notifications(); track n.id) {
                <li [class.unread]="!n.read" (click)="markOneRead(n)">
                  <div class="notif-title">{{ n.title }}</div>
                  <div class="notif-body">{{ n.body }}</div>
                  <div class="notif-time">{{ n.createdAt | date: 'short' }}</div>
                </li>
              }
            </ul>
          }
        </section>
      }

      <section class="card form-card">
        <h2>Add tracking</h2>
        <p class="muted small">Paste a product page URL — we detect name, store, and price automatically.</p>
        <form [formGroup]="form" (ngSubmit)="create()">
          <div class="single">
            <label>Product URL</label>
            <input formControlName="url" type="url" placeholder="https://..." />
          </div>
          @if (formError()) {
            <p class="err">{{ formError() }}</p>
          }
          <button type="submit" [disabled]="form.invalid || saving()">Add</button>
        </form>
      </section>

      <section class="card">
        <h2>Your items</h2>
        <p class="muted small">
          Automatic rechecks use each item’s interval. Price alerts fire when the price crosses your threshold (in-app +
          email if configured).
        </p>
        @if (refreshError()) {
          <p class="err">{{ refreshError() }}</p>
        }
        @if (patchError()) {
          <p class="err">{{ patchError() }}</p>
        }
        @if (loading()) {
          <p>Loading…</p>
        } @else if (!items().length) {
          <p class="muted">No trackings yet.</p>
        } @else {
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Store</th>
                <th>Price</th>
                <th>Updated</th>
                <th>Recheck</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (t of items(); track t.id) {
                <tr>
                  <td>
                    <a [href]="t.url" target="_blank" rel="noopener">{{ t.displayProductName }}</a>
                  </td>
                  <td class="muted">{{ t.displayCompanyName ?? '—' }}</td>
                  <td>
                    @if (t.lastPrice !== null) {
                      {{ t.lastPrice }} {{ t.currency }}
                    } @else {
                      —
                    }
                  </td>
                  <td>{{ t.lastCheckedAt | date: 'short' }}</td>
                  <td class="muted small-cell">{{ intervalLabel(t.recheckIntervalMinutes) }}</td>
                  <td class="actions">
                    <button type="button" class="small" (click)="toggleEdit(t.id)" [class.active]="editingId() === t.id">
                      {{ editingId() === t.id ? 'Close' : 'Edit' }}
                    </button>
                    <button type="button" class="small" (click)="refresh(t.id)" [disabled]="refreshingId() === t.id">
                      Refresh
                    </button>
                    <button type="button" class="small danger" (click)="remove(t.id)">Delete</button>
                  </td>
                </tr>
                @if (editingId() === t.id) {
                  <tr class="edit-row">
                    <td colspan="6">
                      <form [formGroup]="editForm" (ngSubmit)="saveEdit(t.id)" class="edit-form">
                        <div class="grid">
                          <div>
                            <label>Product name (optional)</label>
                            <input formControlName="productNameOverride" type="text" placeholder="Leave empty for auto" />
                            <p class="hint">Detected: {{ t.productName }}</p>
                          </div>
                          <div>
                            <label>Store name (optional)</label>
                            <input formControlName="companyNameOverride" type="text" placeholder="Leave empty for auto" />
                            <p class="hint">Detected: {{ t.companyName ?? '—' }}</p>
                          </div>
                          <div>
                            <label>Recheck every</label>
                            <select formControlName="recheckIntervalMinutes">
                              @for (opt of intervalOptions; track opt.minutes) {
                                <option [ngValue]="opt.minutes">{{ opt.label }}</option>
                              }
                            </select>
                          </div>
                          <div>
                            <label>Alert when price ≤</label>
                            <input formControlName="alertBelowPrice" type="number" step="0.01" min="0" placeholder="e.g. 25" />
                          </div>
                          <div>
                            <label>Alert when price ≥</label>
                            <input formControlName="alertAbovePrice" type="number" step="0.01" min="0" placeholder="e.g. 80" />
                          </div>
                        </div>
                        <p class="hint">
                          Clear alert fields and save to remove thresholds. Alerts notify once when the price crosses from
                          the wrong side of your target.
                        </p>
                        <div class="edit-actions">
                          <button type="submit" class="small" [disabled]="savingEdit()">Save</button>
                          <button type="button" class="small ghost" (click)="clearEdit()">Cancel</button>
                        </div>
                      </form>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        }
      </section>
    </div>
  `,
  styles: [
    `
      .wrap {
        max-width: 1100px;
        margin: 0 auto;
        padding: 2rem 1rem 4rem;
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
        margin-bottom: 2rem;
        flex-wrap: wrap;
      }
      .head-actions {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }
      .notif-btn {
        position: relative;
      }
      .badge {
        position: absolute;
        top: -6px;
        right: -6px;
        min-width: 1.1rem;
        height: 1.1rem;
        padding: 0 4px;
        border-radius: 999px;
        background: #f87171;
        color: #fff;
        font-size: 0.65rem;
        line-height: 1.1rem;
        text-align: center;
      }
      h1 {
        margin: 0;
        font-size: 1.75rem;
      }
      h2 {
        margin: 0 0 1rem;
        font-size: 1.1rem;
      }
      .muted {
        color: var(--muted);
        margin: 0.35rem 0 0;
        font-size: 0.9rem;
      }
      .muted.small {
        margin: 0 0 0.75rem;
        font-size: 0.85rem;
      }
      .card {
        background: var(--card);
        border-radius: 12px;
        padding: 1.25rem 1.5rem;
        box-shadow: var(--shadow);
        margin-bottom: 1.25rem;
      }
      .notif-panel {
        margin-bottom: 1.25rem;
      }
      .notif-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
      }
      .notif-head h2 {
        margin: 0;
      }
      .notif-list {
        list-style: none;
        margin: 0;
        padding: 0;
        max-height: 320px;
        overflow-y: auto;
      }
      .notif-list li {
        padding: 0.65rem 0;
        border-bottom: 1px solid var(--border);
        cursor: pointer;
      }
      .notif-list li.unread {
        background: rgba(59, 130, 246, 0.08);
        margin: 0 -0.5rem;
        padding-left: 0.5rem;
        padding-right: 0.5rem;
        border-radius: 8px;
      }
      .notif-title {
        font-weight: 600;
        font-size: 0.9rem;
      }
      .notif-body {
        font-size: 0.85rem;
        color: var(--muted);
        margin-top: 0.25rem;
      }
      .notif-time {
        font-size: 0.75rem;
        color: var(--muted);
        margin-top: 0.35rem;
      }
      .form-card label {
        display: block;
        font-size: 0.8rem;
        color: var(--muted);
        margin-bottom: 0.25rem;
      }
      .single {
        margin-bottom: 0.25rem;
      }
      input,
      select {
        width: 100%;
        padding: 0.45rem 0.6rem;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--text);
      }
      button {
        margin-top: 1rem;
        padding: 0.55rem 1rem;
        border: none;
        border-radius: 8px;
        background: var(--accent);
        color: #fff;
        font-weight: 600;
        cursor: pointer;
      }
      button.ghost {
        background: transparent;
        color: var(--text);
        border: 1px solid var(--border);
        margin-top: 0;
      }
      button.small {
        margin-top: 0;
        padding: 0.35rem 0.6rem;
        font-size: 0.85rem;
      }
      button.small.active {
        border-color: var(--accent);
        color: var(--accent);
      }
      button.danger {
        background: transparent;
        color: #f87171;
        border: 1px solid rgba(248, 113, 113, 0.4);
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
      }
      th,
      td {
        text-align: left;
        padding: 0.5rem 0.35rem;
        border-bottom: 1px solid var(--border);
        vertical-align: top;
      }
      th {
        color: var(--muted);
        font-weight: 500;
      }
      .small-cell {
        font-size: 0.8rem;
        white-space: nowrap;
      }
      .actions {
        display: flex;
        gap: 0.35rem;
        flex-wrap: wrap;
      }
      a {
        color: var(--accent);
      }
      .err {
        color: #f87171;
        margin-top: 0.5rem;
        font-size: 0.9rem;
      }
      .edit-row td {
        background: rgba(0, 0, 0, 0.03);
        padding: 1rem;
      }
      .edit-form .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 0.75rem 1rem;
      }
      .edit-form label {
        display: block;
        font-size: 0.75rem;
        color: var(--muted);
        margin-bottom: 0.25rem;
      }
      .hint {
        font-size: 0.75rem;
        color: var(--muted);
        margin: 0.25rem 0 0;
      }
      .edit-actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.75rem;
      }
    `,
  ],
})
export class DashboardComponent implements OnInit {
  protected readonly intervalOptions = intervalOptionsForMin(environment.minRecheckIntervalMinutes);

  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);

  form = this.fb.nonNullable.group({
    url: ['', [Validators.required]],
  });

  editForm = this.fb.nonNullable.group({
    productNameOverride: [''],
    companyNameOverride: [''],
    recheckIntervalMinutes: [360],
    alertBelowPrice: [''],
    alertAbovePrice: [''],
  });

  items = signal<Tracking[]>([]);
  profile = signal<UserProfile | null>(null);
  loading = signal(true);
  saving = signal(false);
  savingEdit = signal(false);
  refreshingId = signal<string | null>(null);
  formError = signal<string | null>(null);
  refreshError = signal<string | null>(null);
  patchError = signal<string | null>(null);
  editingId = signal<string | null>(null);

  notifications = signal<AppNotification[]>([]);
  notifCount = signal(0);
  notifOpen = signal(false);
  notifLoading = signal(false);

  ngOnInit() {
    this.auth.loadProfile().subscribe({
      next: (p) => this.profile.set(p),
      error: () => {},
    });
    this.load();
    this.loadNotifCount();
  }

  intervalLabel(minutes: number): string {
    const o = ALL_INTERVAL_OPTIONS.find((x) => x.minutes === minutes);
    return o ? o.label : `${minutes} min`;
  }

  load() {
    this.loading.set(true);
    this.http.get<Tracking[]>(`${environment.apiUrl}/trackings`).subscribe({
      next: (rows) => {
        this.items.set(rows);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadNotifications() {
    this.notifLoading.set(true);
    this.http.get<AppNotification[]>(`${environment.apiUrl}/notifications`).subscribe({
      next: (rows) => {
        this.notifications.set(rows);
        this.notifLoading.set(false);
      },
      error: () => this.notifLoading.set(false),
    });
  }

  loadNotifCount() {
    this.http.get<{ count: number }>(`${environment.apiUrl}/notifications/unread-count`).subscribe({
      next: (r) => this.notifCount.set(r.count),
      error: () => {},
    });
  }

  toggleNotifs() {
    const next = !this.notifOpen();
    this.notifOpen.set(next);
    if (next) {
      this.loadNotifications();
    }
  }

  markOneRead(n: AppNotification) {
    if (n.read) return;
    this.http.patch(`${environment.apiUrl}/notifications/${n.id}/read`, {}).subscribe({
      next: () => {
        this.notifications.update((list) =>
          list.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
        );
        this.loadNotifCount();
      },
    });
  }

  markAllRead() {
    this.http.post(`${environment.apiUrl}/notifications/read-all`, {}).subscribe({
      next: () => {
        this.notifications.update((list) => list.map((x) => ({ ...x, read: true })));
        this.notifCount.set(0);
      },
    });
  }

  create() {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.formError.set(null);
    const v = this.form.getRawValue();
    this.http.post<Tracking>(`${environment.apiUrl}/trackings`, { url: v.url }).subscribe({
      next: () => {
        this.form.reset({ url: '' });
        this.saving.set(false);
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        const m = e.error?.message;
        this.formError.set(Array.isArray(m) ? m[0] : m || 'Could not add tracking');
      },
    });
  }

  toggleEdit(id: string) {
    if (this.editingId() === id) {
      this.editingId.set(null);
      return;
    }
    const t = this.items().find((x) => x.id === id);
    if (!t) return;
    this.patchError.set(null);
    this.editingId.set(id);
    this.editForm.patchValue({
      productNameOverride: t.productNameOverride ?? '',
      companyNameOverride: t.companyNameOverride ?? '',
      recheckIntervalMinutes: Math.max(
        environment.minRecheckIntervalMinutes,
        t.recheckIntervalMinutes,
      ),
      alertBelowPrice: t.alertBelowPrice != null ? String(t.alertBelowPrice) : '',
      alertAbovePrice: t.alertAbovePrice != null ? String(t.alertAbovePrice) : '',
    });
  }

  clearEdit() {
    this.editingId.set(null);
  }

  saveEdit(id: string) {
    this.savingEdit.set(true);
    this.patchError.set(null);
    const v = this.editForm.getRawValue();
    const body: Record<string, unknown> = {
      recheckIntervalMinutes: v.recheckIntervalMinutes,
      productNameOverride: v.productNameOverride.trim() === '' ? null : v.productNameOverride.trim(),
      companyNameOverride: v.companyNameOverride.trim() === '' ? null : v.companyNameOverride.trim(),
      alertBelowPrice:
        v.alertBelowPrice === '' || v.alertBelowPrice === null || v.alertBelowPrice === undefined
          ? null
          : Number(v.alertBelowPrice),
      alertAbovePrice:
        v.alertAbovePrice === '' || v.alertAbovePrice === null || v.alertAbovePrice === undefined
          ? null
          : Number(v.alertAbovePrice),
    };
    this.http.patch<Tracking>(`${environment.apiUrl}/trackings/${id}`, body).subscribe({
      next: () => {
        this.savingEdit.set(false);
        this.editingId.set(null);
        this.load();
      },
      error: (e) => {
        this.savingEdit.set(false);
        const m = e.error?.message;
        this.patchError.set(Array.isArray(m) ? m[0] : m || 'Could not save');
      },
    });
  }

  refresh(id: string) {
    this.refreshingId.set(id);
    this.refreshError.set(null);
    this.http.post(`${environment.apiUrl}/trackings/${id}/refresh`, {}).subscribe({
      next: () => {
        this.refreshingId.set(null);
        this.load();
      },
      error: (e) => {
        this.refreshingId.set(null);
        const m = e.error?.message;
        this.refreshError.set(Array.isArray(m) ? m[0] : m || 'Refresh failed');
      },
    });
  }

  remove(id: string) {
    if (!confirm('Delete this tracking?')) return;
    this.http.delete(`${environment.apiUrl}/trackings/${id}`).subscribe({
      next: () => this.load(),
    });
  }

  logout() {
    this.auth.logout();
  }
}
