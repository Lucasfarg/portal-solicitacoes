import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  PoBreadcrumb,
  PoFieldModule,
  PoNotificationService,
  PoPageAction,
  PoPageModule,
  PoSelectOption,
} from '@po-ui/ng-components';
import {
  Category,
  createRequestSchema,
  DESCRIPTION_MAX,
  RequestDetail,
  TITLE_MAX,
} from '@portal/shared';
import { errorMessage } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { ConfirmDialog } from '../core/confirm-dialog';
import { FieldA11y, focusFirstInvalid } from '../core/field-a11y';
import { FieldError } from '../core/field-error';
import { PageA11y } from '../core/po-a11y';
import { PortalApi } from '../core/portal-api';
import { zodValidator } from '../core/zod-validator';
import { LoadState } from '../layout/load-state';
import { canModify, formatHours, listTitle } from './request-view';

const fields = createRequestSchema.shape;

@Component({
  selector: 'app-request-form',
  imports: [
    ReactiveFormsModule,
    LoadState,
    ConfirmDialog,
    PoFieldModule,
    PoPageModule,
    FieldError,
    FieldA11y,
    PageA11y,
  ],
  templateUrl: './request-form.html',
  host: { '(window:beforeunload)': 'warnBeforeUnload($event)' },
})
export class RequestForm {
  private readonly api = inject(PortalApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notification = inject(PoNotificationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly dialog = viewChild.required(ConfirmDialog);

  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');
  protected readonly title = this.id ? 'Editar solicitação' : 'Nova solicitação';

  readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: zodValidator(fields.title) }),
    categoryId: new FormControl<number | null>(null, zodValidator(fields.categoryId)),
    description: new FormControl('', {
      nonNullable: true,
      validators: zodValidator(fields.description),
    }),
  });

  protected readonly titleMax = TITLE_MAX;
  protected readonly descriptionMax = DESCRIPTION_MAX;
  private readonly description = toSignal(this.form.controls.description.valueChanges, {
    initialValue: '',
  });
  protected readonly descriptionHelp = computed(
    () => `${this.description().length} de ${DESCRIPTION_MAX} caracteres`,
  );

  private readonly activeCategories = signal<Category[]>([]);
  // A categoria atual pode ter sido desativada depois: a lista da API só traz as ativas, e sem
  // ela o campo apareceria vazio.
  private readonly currentCategory = signal<RequestDetail['category'] | null>(null);
  protected readonly categoryOptions = computed<PoSelectOption[]>(() => {
    const options = this.activeCategories().map(toOption);
    const current = this.currentCategory();
    if (current && !options.some((option) => option.value === current.id)) {
      options.push({ label: `${current.name} (desativada)`, value: current.id });
    }
    return options;
  });
  protected readonly saving = signal(false);
  // Na edição o formulário fica travado até os dados chegarem, para não sobrescrever o digitado.
  protected readonly loading = signal(this.id !== null);
  private readonly code = signal<string | null>(null);
  private saved = false;

  protected readonly breadcrumb = computed<PoBreadcrumb>(() => {
    const list = { label: listTitle(this.auth.user()), link: '/solicitacoes' };
    if (!this.id) {
      return { items: [list, { label: 'Nova solicitação' }] };
    }
    return {
      items: [
        list,
        { label: this.code() ?? 'Solicitação', link: `/solicitacoes/${this.id}` },
        { label: 'Editar' },
      ],
    };
  });

  protected readonly actions = computed<PoPageAction[]>(() => [
    {
      label: this.saving() ? 'Salvando…' : 'Salvar',
      kind: 'primary',
      action: () => this.save(),
    },
    { label: 'Cancelar', kind: 'secondary', action: () => this.cancel() },
  ]);

  constructor() {
    this.api.categories().subscribe({
      next: (categories) => this.activeCategories.set(categories),
      error: (error: unknown) => this.notification.error(errorMessage(error)),
    });

    if (this.id) {
      this.form.disable();
      this.api.getRequest(Number(this.id)).subscribe({
        next: (request) => this.startEditing(request),
        error: (error: unknown) => this.leave(errorMessage(error), ['/solicitacoes']),
      });
    }
  }

  private startEditing(request: RequestDetail): void {
    if (!canModify(this.auth.user(), request)) {
      this.leave('Só quem abriu a solicitação pode editá-la, e só enquanto está em Aberto.', [
        '/solicitacoes',
        request.id,
      ]);
      return;
    }
    this.code.set(request.code);
    this.currentCategory.set(request.category);
    this.form.setValue({
      title: request.title,
      categoryId: request.category.id,
      description: request.description,
    });
    this.form.enable();
    this.form.markAsPristine();
    this.loading.set(false);
  }

  save(): void {
    // O botão não é desabilitado durante o envio: desabilitado ele perderia o foco.
    if (this.saving() || this.loading()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focusFirstInvalid(this.host.nativeElement);
      return;
    }

    const input = createRequestSchema.parse(this.form.getRawValue());
    const request = this.id
      ? this.api.updateRequest(Number(this.id), input)
      : this.api.createRequest(input);

    this.saving.set(true);
    request.subscribe({
      next: (saved) => {
        this.saved = true;
        this.notification.success(this.id ? `${saved.code} atualizada.` : `${saved.code} aberta.`);
        void this.router.navigate(['/solicitacoes', saved.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.notification.error(errorMessage(error));
      },
    });
  }

  protected cancel(): void {
    void this.router.navigate(this.id ? ['/solicitacoes', this.id] : ['/solicitacoes']);
  }

  // Sessão expirada sai sem perguntar: não há como salvar.
  canLeave(): boolean | Promise<boolean> {
    if (this.saved || !this.form.dirty || !this.auth.user()) {
      return true;
    }
    return new Promise((resolve) =>
      this.dialog().ask(
        {
          title: 'Descartar alterações?',
          message: 'O que você preencheu nesta tela ainda não foi salvo e será perdido.',
          confirmLabel: 'Descartar',
          cancelLabel: 'Continuar editando',
        },
        () => resolve(true),
        () => resolve(false),
      ),
    );
  }

  protected warnBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.saved && this.form.dirty) {
      event.preventDefault();
    }
  }

  private leave(message: string, route: unknown[]): void {
    this.saved = true;
    this.notification.warning(message);
    void this.router.navigate(route);
  }
}

function toOption(category: Category): PoSelectOption {
  return {
    label: `${category.name} (prazo de ${formatHours(category.slaHours)})`,
    value: category.id,
  };
}
