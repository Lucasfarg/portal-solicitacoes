import { Directive, ElementRef, afterEveryRender, inject, input } from '@angular/core';
import { NgControl } from '@angular/forms';

// Liga um campo à sua mensagem de erro para quem usa leitor de tela. Vai no próprio campo
// (um <input> nativo ou um componente do PO UI, que não oferece essa ligação) e grava no
// controle nativo:
// - aria-describedby com o id da mensagem (o app-field-error logo abaixo do campo), somado
//   ao que o componente já tinha ali (o texto de ajuda do PO UI, por exemplo);
// - aria-invalid, verdadeiro quando a pessoa já passou pelo campo e ele está inválido.
@Directive({ selector: '[appErrorId]' })
export class FieldA11y {
  readonly errorId = input.required<string>({ alias: 'appErrorId' });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly control = inject(NgControl);

  constructor() {
    // Depois de cada renderização, quando o <input> de dentro do componente já existe.
    afterEveryRender(() => {
      const native = nativeControl(this.host.nativeElement);
      const invalid = Boolean(this.control.touched && this.control.invalid);
      if (!native) {
        return;
      }
      const described = (native.getAttribute('aria-describedby') ?? '').split(/\s+/);
      if (!described.includes(this.errorId())) {
        const ids = [...described.filter(Boolean), this.errorId()];
        native.setAttribute('aria-describedby', ids.join(' '));
      }
      native.setAttribute('aria-invalid', String(invalid));
    });
  }
}

// O controle nativo de um campo: ele mesmo ou o que o componente do PO UI renderiza dentro.
function nativeControl(field: HTMLElement): HTMLElement | null {
  const selector = 'input, select, textarea';
  return field.matches(selector) ? field : field.querySelector<HTMLElement>(selector);
}

// Depois de uma tentativa de salvar com erro: leva o foco ao primeiro campo inválido.
// O Angular marca com a classe ng-invalid o elemento que tem o formControlName.
export function focusFirstInvalid(form: HTMLElement): void {
  const field = form.querySelector<HTMLElement>('[formControlName].ng-invalid');
  if (field) {
    nativeControl(field)?.focus();
  }
}
