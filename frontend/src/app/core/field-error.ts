import { Component, input } from '@angular/core';
import { AbstractControl } from '@angular/forms';

// Sem role="alert" de propósito: salvar com três campos inválidos dispararia três anúncios
// junto com o foco no primeiro campo. O leitor lê a mensagem via aria-describedby.
@Component({
  selector: 'app-field-error',
  template: `
    @if (message; as text) {
      <p class="field-error">{{ text }}</p>
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
