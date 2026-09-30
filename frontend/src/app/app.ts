import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PoPageModule, PoTagModule, PoWidgetModule } from '@po-ui/ng-components';
import { REQUEST_STATUS_LABELS, REQUEST_STATUSES } from '@portal/shared';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PoPageModule, PoWidgetModule, PoTagModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly statuses = REQUEST_STATUSES.map((status) => ({
    value: status,
    label: REQUEST_STATUS_LABELS[status],
  }));
}
