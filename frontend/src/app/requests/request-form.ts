import { Component, ElementRef, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  PoButtonModule,
  PoFieldModule,
  PoNotificationService,
  PoSelectOption,
} from '@po-ui/ng-components';
import { Category, createRequestSchema, RequestDetail } from '@portal/shared';
import { errorMessage } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { FieldA11y, focusFirstInvalid } from '../core/field-a11y';
import { FieldError } from '../core/field-error';
import { PortalApi } from '../core/portal-api';
import { zodValidator } from '../core/zod-validator';
import { Page } from '../layout/page';
import { canModify } from './request-view';

const fields = createRequestSchema.shape;

// Formulário de abrir e de editar solicitação: a rota com :id é edição.
@Component({
  selector: 'app-request-form',
  imports: [ReactiveFormsModule, Page, PoFieldModule, PoButtonModule, FieldError, FieldA11y],
  templateUrl: './request-form.html',
})
export class RequestForm {
  private readonly api = inject(PortalApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notification = inject(PoNotificationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  // Id da solicitação em edição; nulo quando é uma nova.
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');
  protected readonly title = this.id ? 'Editar solicitação' : 'Nova solicitação';

  // Cada campo é validado pelo schema Zod de shared/ — o mesmo que valida o corpo na API.
  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: zodValidator(fields.title) }),
    categoryId: new FormControl<number | null>(null, zodValidator(fields.categoryId)),
    description: new FormControl('', {
      nonNullable: true,
      validators: zodValidator(fields.description),
    }),
  });

  protected readonly categoryOptions = signal<PoSelectOption[]>([]);
  protected readonly saving = signal(false);

  constructor() {
    this.api.categories().subscribe({
      next: (categories) => this.categoryOptions.set(categories.map(toOption)),
      error: (error: unknown) => this.notification.error(errorMessage(error)),
    });

    if (this.id) {
      this.api.getRequest(Number(this.id)).subscribe({
        next: (request) => this.startEditing(request),
        error: (error: unknown) => this.leave(errorMessage(error), ['/solicitacoes']),
      });
    }
  }

  private startEditing(request: RequestDetail): void {
    // Quem chega pela URL sem poder editar volta para o detalhe (a API também recusaria).
    if (!canModify(this.auth.user(), request)) {
      this.leave('Esta solicitação não pode mais ser editada.', ['/solicitacoes', request.id]);
      return;
    }
    this.form.setValue({
      title: request.title,
      categoryId: request.category.id,
      description: request.description,
    });
  }

  save(): void {
    // Um segundo clique enquanto a API responde não envia de novo. O botão não é desabilitado:
    // desabilitado ele perderia o foco.
    if (this.saving()) {
      return;
    }
    if (this.form.invalid) {
      // Mostra as mensagens de todos os campos, inclusive os que a pessoa não tocou, e
      // leva o foco ao primeiro campo com erro.
      this.form.markAllAsTouched();
      focusFirstInvalid(this.host.nativeElement);
      return;
    }

    // O parse aplica as transformações do schema (tira espaços das pontas).
    const input = createRequestSchema.parse(this.form.getRawValue());
    const request = this.id
      ? this.api.updateRequest(Number(this.id), input)
      : this.api.createRequest(input);

    this.saving.set(true);
    request.subscribe({
      next: (saved) => {
        this.notification.success(this.id ? `${saved.code} atualizada.` : `${saved.code} aberta.`);
        void this.router.navigate(['/solicitacoes', saved.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        // O que o formulário não tem como prever (ex.: categoria desativada enquanto a
        // tela estava aberta) a API recusa, e o motivo aparece no aviso.
        this.notification.error(errorMessage(error));
      },
    });
  }

  protected cancel(): void {
    void this.router.navigate(this.id ? ['/solicitacoes', this.id] : ['/solicitacoes']);
  }

  private leave(message: string, route: unknown[]): void {
    this.notification.warning(message);
    void this.router.navigate(route);
  }
}

function toOption(category: Category): PoSelectOption {
  return { label: `${category.name} (prazo de ${category.slaHours} h)`, value: category.id };
}
