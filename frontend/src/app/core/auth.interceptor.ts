import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

function isApiRequest(url: string): boolean {
  return url.includes('/api/') || url.endsWith('/api');
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const headers: Record<string, string> = {};
  // Don't let the service worker answer API calls with a cached app shell or an old empty list.
  if (isApiRequest(req.url)) headers['ngsw-bypass'] = 'true';
  const token = auth.readToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (Object.keys(headers).length === 0) return next(req);
  return next(req.clone({ setHeaders: headers }));
};
