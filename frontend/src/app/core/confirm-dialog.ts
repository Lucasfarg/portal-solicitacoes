import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { PoModalAction, PoModalComponent, PoModalModule } from '@po-ui/ng-components';

export interface ConfirmQuestion {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

let nextId = 0;

// O po-modal não declara que é um diálogo: role, aria-modal e os ids do título e da mensagem
// são gravados no elemento que ele desenha. Ele também deixa o Tab escapar para a página de
// trás e ignora o Esc quando o foco saiu: os dois são tratados aqui.
@Component({
  selector: 'app-confirm-dialog',
  imports: [PoModalModule],
  host: {
    '(document:focusin)': 'keepFocusInside($event)',
    '(document:keydown.escape)': 'closeOnEscape()',
  },
  template: `
    <po-modal
      #modal
      [p-title]="question().title"
      [p-primary-action]="primary()"
      [p-secondary-action]="secondary()"
      (p-close)="closed()"
    >
      <p class="confirm-message" [id]="id + '-message'">{{ question().message }}</p>
    </po-modal>
  `,
  styles: `
    .confirm-message {
      margin: 0;
    }
  `,
})
export class ConfirmDialog {
  // Pode haver mais de uma janela na página (a do Shell e a da tela).
  protected readonly id = `confirm-${nextId++}`;
  protected readonly question = signal<ConfirmQuestion>({ title: '', message: '' });

  protected readonly primary = computed<PoModalAction>(() => ({
    label: this.question().confirmLabel ?? 'Confirmar',
    action: () => this.answer('confirm'),
  }));
  protected readonly secondary = computed<PoModalAction>(() => ({
    label: this.question().cancelLabel ?? 'Cancelar',
    action: () => this.answer('cancel'),
  }));

  private readonly modal = viewChild.required<PoModalComponent>('modal');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly changes = inject(ChangeDetectorRef);
  private isOpen = false;
  private choice: 'confirm' | 'cancel' = 'cancel';
  private onConfirm: () => void = () => undefined;
  private onCancel: () => void = () => undefined;

  ask(
    question: ConfirmQuestion,
    onConfirm: () => void,
    onCancel: () => void = () => undefined,
  ): void {
    if (this.isOpen) {
      onCancel();
      return;
    }
    this.isOpen = true;
    this.choice = 'cancel';
    this.question.set(question);
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
    this.modal().open();
    // O po-modal move o foco num setTimeout; sem desenhar antes, o foco fica no botão de trás.
    this.changes.detectChanges();
    this.describeDialog();
    // Foco já em "Cancelar"; o po-modal só faria isso no timer.
    this.host.nativeElement.querySelectorAll<HTMLElement>('.po-modal-content button')[1]?.focus();
  }

  private answer(choice: 'confirm' | 'cancel'): void {
    this.choice = choice;
    this.modal().close();
  }

  protected keepFocusInside(event: FocusEvent): void {
    const content = this.host.nativeElement.querySelector('.po-modal-content');
    if (this.isOpen && content && !content.contains(event.target as Node)) {
      content.querySelectorAll<HTMLElement>('button')[1]?.focus();
    }
  }

  protected closeOnEscape(): void {
    if (this.isOpen) {
      this.answer('cancel');
    }
  }

  protected closed(): void {
    this.isOpen = false;
    if (this.choice === 'confirm') {
      this.onConfirm();
    } else {
      this.onCancel();
    }
  }

  private describeDialog(): void {
    const element = this.host.nativeElement;
    const content = element.querySelector('.po-modal-content');
    const title = element.querySelector('.po-modal-title');
    title?.setAttribute('id', `${this.id}-title`);
    content?.setAttribute('role', 'dialog');
    content?.setAttribute('aria-modal', 'true');
    content?.setAttribute('aria-labelledby', `${this.id}-title`);
    content?.setAttribute('aria-describedby', `${this.id}-message`);
  }
}
