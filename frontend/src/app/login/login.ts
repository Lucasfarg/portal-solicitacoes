import { Component, ElementRef, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PoButtonModule, PoButtonType, PoFieldModule } from '@po-ui/ng-components';
import { loginSchema } from '@portal/shared';
import { errorMessage } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { FieldA11y, focusFirstInvalid } from '../core/field-a11y';
import { FieldError } from '../core/field-error';
import { FieldAutocomplete, PasswordPeekA11y } from '../core/po-a11y';
import { zodValidator } from '../core/zod-validator';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    PoButtonModule,
    PoFieldModule,
    FieldError,
    FieldA11y,
    FieldAutocomplete,
    PasswordPeekA11y,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly form = new FormGroup({
    username: new FormControl('', {
      nonNullable: true,
      validators: zodValidator(loginSchema.shape.username),
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: zodValidator(loginSchema.shape.password),
    }),
  });

  protected readonly submitType = PoButtonType.Submit;
  protected readonly loading = signal(false);
  // Resposta da API quando o login falha (senha errada, muitas tentativas).
  protected readonly failure = signal<string | null>(null);

  protected submit(): void {
    // Um segundo Enter enquanto a API responde não envia de novo.
    if (this.loading()) {
      return;
    }
    if (this.form.invalid) {
      // Mostra as mensagens e leva o foco ao primeiro campo com erro.
      this.form.markAllAsTouched();
      focusFirstInvalid(this.host.nativeElement);
      return;
    }

    this.loading.set(true);
    this.failure.set(null);
    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => {
        // Volta para a página que a pessoa tentou abrir antes de cair no login.
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
        void this.router.navigateByUrl(returnUrl);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.failure.set(errorMessage(error));
      },
    });
  }
}
