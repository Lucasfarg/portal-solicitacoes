import { Component, computed, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import {
  PoMenuItem,
  PoMenuModule,
  PoToolbarAction,
  PoToolbarModule,
  PoToolbarProfile,
} from '@po-ui/ng-components';
import { USER_ROLE_LABELS } from '@portal/shared';
import { AuthService } from '../core/auth.service';

// Layout das telas internas: barra do topo com o usuário, menu lateral e a tela da rota.
// O po-menu já vira menu recolhido (ícone de hambúrguer) em telas estreitas.
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, PoToolbarModule, PoMenuModule],
  template: `
    <div class="po-wrapper">
      <po-toolbar
        p-title="Portal de Solicitações Internas"
        [p-profile]="profile()"
        [p-profile-actions]="profileActions"
      />
      <po-menu [p-menus]="menus" />
      <router-outlet />
    </div>
  `,
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly menus: PoMenuItem[] = [
    { label: 'Painel', shortLabel: 'Painel', icon: 'an an-chart-bar', link: '/painel' },
    {
      label: 'Solicitações',
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
  ];

  protected readonly profile = computed<PoToolbarProfile>(() => {
    const user = this.auth.user();
    return { title: user?.name ?? '', subtitle: user ? USER_ROLE_LABELS[user.role] : '' };
  });

  protected readonly profileActions: PoToolbarAction[] = [
    { label: 'Sair', icon: 'an an-sign-out', action: () => this.logout() },
  ];

  private logout(): void {
    // A sessão é apagada no servidor; só depois a tela volta ao login.
    this.auth.logout().subscribe(() => void this.router.navigate(['/login']));
  }
}
