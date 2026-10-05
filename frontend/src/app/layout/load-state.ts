import { Component, input, output } from '@angular/core';
import { PoButtonModule } from '@po-ui/ng-components';

// O que a tela mostra enquanto os dados não chegam, ou quando a busca falhou: o texto de
// carregando (anunciado pelo leitor de tela) ou o motivo da falha com "Tentar de novo".
@Component({
  selector: 'app-load-state',
  imports: [PoButtonModule],
  template: `
    <div role="status">
      @if (error(); as message) {
        <p class="po-font-text load-error">{{ message }}</p>
      } @else if (loading()) {
        <p class="po-font-text">Carregando…</p>
      }
    </div>
    @if (error()) {
      <po-button p-label="Tentar de novo" (p-click)="retry.emit()" />
    }
  `,
  styles: `
    :host {
      display: block;
    }

    p {
      margin: 0 0 var(--spacing-sm);
    }

    .load-error {
      color: var(--color-feedback-negative-dark);
    }
  `,
})
export class LoadState {
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly retry = output();
}
