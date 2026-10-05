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

// Janela de confirmação sobre o po-modal. O po-modal prende o foco dentro dela, fecha com Esc e
// devolve o foco ao botão que abriu; o foco entra em "Cancelar", o primeiro botão. Ele não
// declara que é uma janela de diálogo: aqui o role, o aria-modal e os ids do título e da
// mensagem são gravados no elemento que ele desenha.
@Component({
  selector: 'app-confirm-dialog',
  imports: [PoModalModule],
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
  // Cada janela tem ids próprios: pode haver mais de uma na página (a do Shell e a da tela).
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

  // Abre a janela; `onConfirm` só roda se a pessoa escolher o botão de confirmar, e
  // `onCancel` quando ela cancela ou fecha com Esc.
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
    // O po-modal leva o foco para dentro dele num setTimeout; se a janela ainda não foi desenhada
    // (o app agrupa os eventos e renderiza no quadro seguinte), o foco fica no botão de trás e a
    // janela não prende o Tab. Desenhar agora, antes do timer, evita isso.
    this.changes.detectChanges();
    this.describeDialog();
    // O foco entra já, em "Cancelar" (o primeiro botão depois do X); o po-modal faria o mesmo
    // só no timer, e até lá o Tab ainda andaria pela página de trás.
    this.host.nativeElement.querySelectorAll<HTMLElement>('.po-modal-content button')[1]?.focus();
  }

  private answer(choice: 'confirm' | 'cancel'): void {
    this.choice = choice;
    this.modal().close();
  }

  // Esc, o X e os dois botões passam por aqui: o po-modal avisa que fechou.
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
