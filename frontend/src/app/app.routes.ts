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
      // O título da aba de cada tela interna vem do h1 dela (layout/page.ts).
      { path: 'painel', component: Dashboard },
      { path: 'solicitacoes', component: RequestList },
      { path: 'solicitacoes/nova', component: RequestForm },
      { path: 'solicitacoes/:id', component: RequestDetailPage },
      { path: 'solicitacoes/:id/editar', component: RequestForm },
    ],
  },
  { path: '**', redirectTo: '' },
];
