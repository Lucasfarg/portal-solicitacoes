import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import {
  PoMenuItem,
  PoMenuModule,
  PoNotificationService,
  PoToolbarAction,
  PoToolbarModule,
  PoToolbarProfile,
} from '@po-ui/ng-components';
import { USER_ROLE_LABELS } from '@portal/shared';
import { distinctUntilChanged, filter } from 'rxjs';
import { errorMessage, NO_SERVER_MESSAGE } from '../core/api-error';
import { AuthService } from '../core/auth.service';
import { ConfirmDialog } from '../core/confirm-dialog';
import { MenuA11y, ToolbarA11y } from '../core/po-a11y';
import { SessionTimer } from '../core/session-timer';
import { listTitle } from '../requests/request-view';

const pathOf = (event: NavigationEnd) => event.urlAfterRedirects.split('?')[0];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, PoToolbarModule, PoMenuModule, ConfirmDialog, ToolbarA11y, MenuA11y],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly session = inject(SessionTimer);
  private readonly injector = inject(Injector);
  private readonly notification = inject(PoNotificationService);

  protected readonly user = this.auth.user;
  protected readonly roleLabels = USER_ROLE_LABELS;

  protected readonly menus = computed<PoMenuItem[]>(() => [
    { label: 'Painel', shortLabel: 'Painel', icon: 'an an-chart-bar', link: '/painel' },
    {
      label: listTitle(this.user()),
      shortLabel: 'Solicitações',
      icon: 'an an-list',
      link: '/solicitacoes',
    },
    {
      label: 'Nova solicitação',
      shortLabel: 'Nova',
      icon: 'an an-plus',
      link: '/solicitacoes/nova',
    },
  ]);

  protected readonly profile = computed<PoToolbarProfile>(() => {
    const user = this.user();
    return { title: user?.name ?? '', subtitle: user ? this.roleLabels[user.role] : '' };
  });

  protected readonly profileActions: PoToolbarAction[] = [
    { label: 'Sair', icon: 'an an-sign-out', action: () => this.logout() },
  ];

  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');
  private readonly expiryDialog = viewChild.required(ConfirmDialog);

  constructor() {
    // A cada troca de tela o foco vai para o título, que o leitor anuncia. Mudar só o filtro
    // ou a página da lista não conta (o caminho é o mesmo).
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        distinctUntilChanged((previous, current) => pathOf(previous) === pathOf(current)),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        afterNextRender(
          () =>
            this.main().nativeElement.querySelector<HTMLElement>('[aria-level="1"], h1')?.focus(),
          {
            injector: this.injector,
          },
        );
      });

    effect(() => {
      if (this.session.expiring()) {
        untracked(() => this.warnAboutExpiry());
      }
    });
  }

  protected skipToContent(event: Event): void {
    // Com <base href="/"> o "#conteudo" apontaria para a raiz do site.
    event.preventDefault();
    this.main().nativeElement.focus();
  }

  protected logout(): void {
    this.auth.logout().subscribe({
      next: () => {
        this.session.stop();
        void this.router.navigate(['/login']);
      },
      error: (error: unknown) => {
        const reason = errorMessage(error);
        this.notification.error(
          reason === NO_SERVER_MESSAGE
            ? 'Não foi possível sair: o servidor não respondeu. Tente de novo.'
            : `Não foi possível sair: ${reason}`,
        );
      },
    });
  }

  private warnAboutExpiry(): void {
    this.expiryDialog().ask(
      {
        title: 'Sua sessão está perto de expirar',
        message: `Por segurança, a sessão termina depois de ${this.session.idleMinutes()} minutos sem uso. Deseja continuar conectado?`,
        confirmLabel: 'Continuar conectado',
        cancelLabel: 'Agora não',
      },
      () =>
        this.auth.keepAlive().subscribe({
          error: (error: unknown) =>
            error instanceof HttpErrorResponse && error.status === 401
              ? this.session.expire()
              : this.notification.error(errorMessage(error)),
        }),
    );
  }
}
