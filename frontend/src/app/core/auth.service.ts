import { HttpClient } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

const TOKEN_KEY = 'spt_token';

export type UserProfile = {
  id: string;
  email: string;
  planTier: 'FREE' | 'PRO';
  isAdmin: boolean;
  paypalSubscriptionId: string | null;
  createdAt: string;
};

export type RegisterResponse =
  | { access_token: string; user: { id: string; email: string } }
  | { verificationRequired: true; email: string };

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenSig = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  readonly token = this.tokenSig.asReadonly();
  readonly isLoggedIn = computed(() => !!this.tokenSig());
  readonly user = signal<UserProfile | null>(null);

  constructor(
    private http: HttpClient,
    private router: Router,
  ) {}

  loadProfile() {
    return this.http.get<UserProfile>(`${environment.apiUrl}/auth/me`).pipe(
      tap((u) => this.user.set(u)),
    );
  }

  register(email: string, password: string, acceptTerms: boolean) {
    return this.http
      .post<RegisterResponse>(`${environment.apiUrl}/auth/register`, { email, password, acceptTerms })
      .pipe(
        tap((r) => {
          if ('access_token' in r) this.setToken(r.access_token);
        }),
      );
  }

  verifyEmail(token: string) {
    return this.http
      .post<{ access_token: string; user: { id: string; email: string } }>(
        `${environment.apiUrl}/auth/verify-email`,
        { token },
      )
      .pipe(tap((r) => this.setToken(r.access_token)));
  }

  resendVerification(email: string) {
    return this.http.post<{ ok: boolean }>(`${environment.apiUrl}/auth/resend-verification`, { email });
  }

  login(email: string, password: string) {
    return this.http
      .post<{ access_token: string; user: { id: string; email: string } }>(
        `${environment.apiUrl}/auth/login`,
        { email, password },
      )
      .pipe(tap((r) => this.setToken(r.access_token)));
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    this.tokenSig.set(null);
    this.user.set(null);
    void this.router.navigate(['/login']);
  }

  setToken(t: string) {
    localStorage.setItem(TOKEN_KEY, t);
    this.tokenSig.set(t);
  }

  getAuthHeader(): Record<string, string> {
    const t = this.tokenSig();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }
}
