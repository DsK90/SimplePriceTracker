import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PageTopNavComponent } from '../components/page-top-nav.component';

@Component({
  selector: 'app-imprint',
  standalone: true,
  imports: [CommonModule, TranslatePipe, PageTopNavComponent],
  templateUrl: './imprint.component.html',
})
export class ImprintComponent {}
