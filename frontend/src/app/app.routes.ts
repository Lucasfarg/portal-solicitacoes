import { CanDeactivateFn, Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';
import { Dashboard } from './dashboard/dashboard';
import { Shell } from './layout/shell';
import { Login } from './login/login';
import { RequestDetailPage } from './requests/request-detail';
import { RequestForm } from './requests/request-form';
import { RequestList } from './requests/request-list';

// Sair do formulário com alterações não salvas pergunta antes (requests/request-form.ts).
const leaveForm: CanDeactivateFn<RequestForm> = (form) => form.canLeave();

export const routes: Routes = [
  { path: 'login', component: Login, canActivate: [guestGuard], title: 'Entrar — Portal' },
  {
    // Tudo aqui dentro exige sessão e aparece dentro do layout (barra do topo + menu).
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'painel' },
      // O título da aba de cada tela interna vem do título dela (core/po-a11y.ts, PageA11y).
      { path: 'painel', component: Dashboard },
      { path: 'solicitacoes', component: RequestList },
      { path: 'solicitacoes/nova', component: RequestForm, canDeactivate: [leaveForm] },
      { path: 'solicitacoes/:id', component: RequestDetailPage },
      { path: 'solicitacoes/:id/editar', component: RequestForm, canDeactivate: [leaveForm] },
    ],
  },
  { path: '**', redirectTo: '' },
];
