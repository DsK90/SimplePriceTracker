import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { DashboardComponent } from './pages/dashboard.component';
import { LoginComponent } from './pages/login.component';
import { PricingComponent } from './pages/pricing.component';
import { RegisterComponent } from './pages/register.component';
import { VerifyEmailComponent } from './pages/verify-email.component';
import { FairUseComponent } from './pages/fair-use.component';
import { GdprComponent } from './pages/gdpr.component';
import { ImprintComponent } from './pages/imprint.component';
import { TermsComponent } from './pages/terms.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'pricing' },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'verify-email', component: VerifyEmailComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'pricing', component: PricingComponent },
  { path: 'fair-use', component: FairUseComponent },
  { path: 'terms', component: TermsComponent },
  { path: 'agb', redirectTo: 'terms', pathMatch: 'full' },
  { path: 'imprint', component: ImprintComponent },
  { path: 'gdpr', component: GdprComponent },
  { path: '**', redirectTo: 'pricing' },
];
