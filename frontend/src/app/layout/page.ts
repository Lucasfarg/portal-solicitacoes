import { Component, ElementRef, effect, inject, input, viewChild } from '@angular/core';
import { Title } from '@angular/platform-browser';

// Moldura de uma tela interna: título, subtítulo, botões de ação e o conteúdo.
// O título é o h1 da tela: é nele que o Shell põe o foco a cada troca de tela (o leitor de
// tela o anuncia) e é ele que vira o título da aba do navegador.
@Component({
  selector: 'app-page',
  template: `
    <ng-content select="[pageBreadcrumb]" />
    <header class="page-header">
      <div>
        <h1 #heading class="page-title" tabindex="-1">{{ title() }}</h1>
        @if (subtitle(); as text) {
          <p class="page-subtitle">{{ text }}</p>
        }
      </div>
      <div class="page-actions">
        <ng-content select="[pageActions]" />
      </div>
    </header>
    <ng-content />
  `,
  styles: `
    .page-header {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--spacing-sm);
      margin-bottom: var(--spacing-md);
    }

    .page-title {
      margin: 0;
      font-size: var(--font-size-lg);
      line-height: 1.3;
      overflow-wrap: anywhere;
    }

    .page-subtitle {
      margin: var(--spacing-xs) 0 0;
    }

    .page-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-xs);
    }
  `,
})
export class Page {
  readonly title = input.required<string>();
  readonly subtitle = input('');

  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  constructor() {
    const browserTitle = inject(Title);
    effect(() => browserTitle.setTitle(`${this.title()} — Portal`));
  }

  // Para a tela devolver o foco ao título quando o botão que o tinha sai da tela.
  focusTitle(): void {
    this.heading().nativeElement.focus();
  }
}
