import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-gdpr',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './gdpr.component.html',
})
export class GdprComponent {}
