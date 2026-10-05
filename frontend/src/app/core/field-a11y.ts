import { Directive, ElementRef, afterEveryRender, inject, input } from '@angular/core';
import { NgControl } from '@angular/forms';

// Liga o campo à mensagem de erro para leitor de tela (aria-describedby e aria-invalid), pois
// os componentes do PO UI não oferecem essa ligação. Soma ao aria-describedby que já existe.
@Directive({ selector: '[appErrorId]' })
export class FieldA11y {
  readonly errorId = input.required<string>({ alias: 'appErrorId' });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly control = inject(NgControl);

  constructor() {
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

function nativeControl(field: HTMLElement): HTMLElement | null {
  const selector = 'input, select, textarea';
  return field.matches(selector) ? field : field.querySelector<HTMLElement>(selector);
}

export function focusFirstInvalid(form: HTMLElement): void {
  const field = form.querySelector<HTMLElement>('[formControlName].ng-invalid');
  if (field) {
    nativeControl(field)?.focus();
  }
}
