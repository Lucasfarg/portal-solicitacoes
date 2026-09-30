import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  IsActiveMatchOptions,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { PoButtonModule } from '@po-ui/ng-components';
import { USER_ROLE_LABELS } from '@portal/shared';
import { distinctUntilChanged, filter } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { ConfirmDialog } from '../core/confirm-dialog';
import { SessionTimer } from '../core/session-timer';

// O caminho de uma navegação, sem a query string.
const pathOf = (event: NavigationEnd) => event.urlAfterRedirects.split('?')[0];

// Layout das telas internas: barra do topo (nome do portal, usuário, Sair), menu e a tela da
// rota. É HTML nativo — header, nav, main — para que leitor de tela e teclado encontrem cada
// região; em telas estreitas o menu fica atrás de um botão "Menu".
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PoButtonModule, ConfirmDialog],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly session = inject(SessionTimer);
  private readonly injector = inject(Injector);

  protected readonly user = this.auth.user;
  protected readonly roleLabels = USER_ROLE_LABELS;

  protected readonly links = [
    { label: 'Painel', path: '/painel' },
    { label: 'Solicitações', path: '/solicitacoes' },
    { label: 'Nova solicitação', path: '/solicitacoes/nova' },
  ];

  // O item do menu é o atual quando o caminho é o mesmo; filtros na URL não contam.
  protected readonly samePath: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'ignored',
  };

  // Só vale em telas estreitas, onde o menu abre e fecha pelo botão.
  protected readonly menuOpen = signal(false);

  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');
  private readonly expiryDialog = viewChild.required(ConfirmDialog);

  constructor() {
    // A cada troca de tela o menu do celular fecha e o foco vai para o título da tela nova,
    // que o leitor de tela anuncia. Mudar só o filtro ou a página da lista não é troca de
    // tela (o caminho é o mesmo), e na carga da página (navegação 1) o foco fica no topo.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        distinctUntilChanged((previous, current) => pathOf(previous) === pathOf(current)),
        filter((event) => event.id > 1),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.menuOpen.set(false);
        afterNextRender(() => this.main().nativeElement.querySelector('h1')?.focus(), {
          injector: this.injector,
        });
      });

    // A sessão termina com 30 minutos sem uso. Antes disso a pessoa é avisada e pode
    // continuar, sem perder o que estava digitando.
    effect(() => {
      if (this.session.expiring()) {
        untracked(() => this.warnAboutExpiry());
      }
    });
  }

  protected skipToContent(event: Event): void {
    // Com <base href="/"> o "#conteudo" apontaria para a raiz do site; o salto é feito aqui.
    event.preventDefault();
    this.main().nativeElement.focus();
  }

  protected logout(): void {
    // A sessão é apagada no servidor; só depois a tela volta ao login.
    this.auth.logout().subscribe(() => {
      this.session.stop();
      void this.router.navigate(['/login']);
    });
  }

  private warnAboutExpiry(): void {
    this.expiryDialog().ask(
      {
        title: 'Sua sessão está perto de expirar',
        message:
          'Por segurança, a sessão termina depois de 30 minutos sem uso. Deseja continuar conectado?',
        confirmLabel: 'Continuar conectado',
        cancelLabel: 'Agora não',
      },
      // A resposta passa pelo interceptor, que recomeça a contagem do aviso.
      () => this.auth.keepAlive().subscribe({ error: () => this.session.stop() }),
    );
  }
}
