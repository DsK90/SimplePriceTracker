import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { DashboardComponent } from './pages/dashboard.component';
import { LoginComponent } from './pages/login.component';
import { PricingComponent } from './pages/pricing.component';
import { RegisterComponent } from './pages/register.component';
import { FairUseComponent } from './pages/fair-use.component';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'pricing' },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'pricing', component: PricingComponent },
  { path: 'fair-use', component: FairUseComponent },
  { path: '**', redirectTo: 'pricing' },
];
