import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

// O mínimo que este arquivo usa de um schema Zod de shared/.
interface Schema {
  safeParse(
    value: unknown,
  ): { success: true } | { success: false; error: { issues: { message: string }[] } };
}

// Liga um schema Zod de shared/ a um campo do Reactive Forms: o campo é validado com a
// mesma regra que a API aplica, e a mensagem mostrada é a mesma que a API devolveria.
export function zodValidator(schema: Schema): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const result = schema.safeParse(control.value);
    return result.success ? null : { zod: result.error.issues[0].message };
  };
}
