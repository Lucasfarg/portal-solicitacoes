import { Component, input } from '@angular/core';
import { AbstractControl } from '@angular/forms';

// Mensagem de erro embaixo de um campo. Aparece depois que o usuário passou pelo campo
// (ou tentou salvar) e mostra a mensagem do schema Zod (core/zod-validator.ts).
@Component({
  selector: 'app-field-error',
  template: `
    @if (message; as text) {
      <p class="field-error" role="alert">{{ text }}</p>
    }
  `,
  styles: `
    .field-error {
      margin: 0 0 var(--spacing-sm);
      padding: 0 var(--spacing-xs);
      color: var(--color-feedback-negative-dark);
      font-size: var(--font-size-sm);
    }
  `,
})
export class FieldError {
  readonly control = input.required<AbstractControl>();

  protected get message(): string | null {
    const { touched, errors } = this.control();
    if (!touched || !errors) {
      return null;
    }
    return errors['zod'] ?? 'Campo inválido';
  }
}
