import { Component, ElementRef, signal, viewChild } from '@angular/core';
import { PoButtonModule } from '@po-ui/ng-components';

export interface ConfirmQuestion {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

let nextId = 0;

// Janela de confirmação sobre o <dialog> nativo. Aberta com showModal(), é o navegador que
// prende o foco dentro dela, deixa o resto da página inerte, fecha com Esc e devolve o foco
// ao botão que abriu. O foco entra em "Cancelar", o primeiro botão.
@Component({
  selector: 'app-confirm-dialog',
  imports: [PoButtonModule],
  template: `
    <dialog
      #dialog
      class="confirm"
      [attr.aria-labelledby]="id + '-title'"
      [attr.aria-describedby]="id + '-message'"
      (close)="closed()"
    >
      <h2 class="confirm-title" [id]="id + '-title'">{{ question().title }}</h2>
      <p class="confirm-message" [id]="id + '-message'">{{ question().message }}</p>
      <div class="confirm-buttons">
        <po-button [p-label]="question().cancelLabel ?? 'Cancelar'" (p-click)="dialog.close()" />
        <po-button
          p-kind="primary"
          [p-label]="question().confirmLabel ?? 'Confirmar'"
          (p-click)="dialog.close('confirm')"
        />
      </div>
    </dialog>
  `,
  styles: `
    .confirm {
      // O tema zera as margens; é a margem automática que centraliza o <dialog>.
      margin: auto;
      width: min(32rem, calc(100vw - 2rem));
      padding: var(--spacing-md);
      border: 1px solid var(--color-neutral-light-20);
      border-radius: 8px;
      color: inherit;
    }

    .confirm::backdrop {
      background: rgb(0 0 0 / 50%);
    }

    .confirm-title {
      margin: 0 0 var(--spacing-sm);
      font-size: var(--font-size-md);
    }

    .confirm-message {
      margin: 0 0 var(--spacing-md);
    }

    .confirm-buttons {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--spacing-xs);
    }
  `,
})
export class ConfirmDialog {
  // Cada janela tem ids próprios: pode haver mais de uma na página (a do Shell e a da tela).
  protected readonly id = `confirm-${nextId++}`;
  protected readonly question = signal<ConfirmQuestion>({ title: '', message: '' });

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private onConfirm: () => void = () => undefined;

  // Abre a janela; `onConfirm` só roda se a pessoa escolher o botão de confirmar.
  ask(question: ConfirmQuestion, onConfirm: () => void): void {
    const dialog = this.dialog().nativeElement;
    if (dialog.open) {
      return;
    }
    this.question.set(question);
    this.onConfirm = onConfirm;
    // O returnValue guarda a resposta da abertura anterior; Esc não o altera.
    dialog.returnValue = '';
    dialog.showModal();
  }

  protected closed(): void {
    if (this.dialog().nativeElement.returnValue === 'confirm') {
      this.onConfirm();
    }
  }
}
