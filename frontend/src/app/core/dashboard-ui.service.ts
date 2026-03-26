import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/** Lets shared chrome (e.g. mobile bottom nav) trigger dashboard-only UI. */
@Injectable({ providedIn: 'root' })
export class DashboardUiService {
  private readonly toggleNotifications$ = new Subject<void>();

  /** Emitted when the user taps “Alerts” on the mobile bar while already on the dashboard. */
  readonly toggleNotifications = this.toggleNotifications$.asObservable();

  requestToggleNotifications(): void {
    this.toggleNotifications$.next();
  }
}
