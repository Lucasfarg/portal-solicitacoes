import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

interface Schema {
  safeParse(
    value: unknown,
  ): { success: true } | { success: false; error: { issues: { message: string }[] } };
}

// Valida o campo com o mesmo schema Zod de shared/ que a API usa.
export function zodValidator(schema: Schema): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const result = schema.safeParse(control.value);
    return result.success ? null : { zod: result.error.issues[0].message };
  };
}
