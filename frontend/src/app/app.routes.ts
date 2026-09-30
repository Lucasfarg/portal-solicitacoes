import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';
import { Dashboard } from './dashboard/dashboard';
import { Shell } from './layout/shell';
import { Login } from './login/login';
import { RequestDetailPage } from './requests/request-detail';
import { RequestForm } from './requests/request-form';
import { RequestList } from './requests/request-list';

export const routes: Routes = [
  { path: 'login', component: Login, canActivate: [guestGuard], title: 'Entrar — Portal' },
  {
    // Tudo aqui dentro exige sessão e aparece dentro do layout (barra do topo + menu).
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'painel' },
      { path: 'painel', component: Dashboard, title: 'Painel — Portal' },
      { path: 'solicitacoes', component: RequestList, title: 'Solicitações — Portal' },
      { path: 'solicitacoes/nova', component: RequestForm, title: 'Nova solicitação — Portal' },
      { path: 'solicitacoes/:id', component: RequestDetailPage, title: 'Solicitação — Portal' },
      {
        path: 'solicitacoes/:id/editar',
        component: RequestForm,
        title: 'Editar solicitação — Portal',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
