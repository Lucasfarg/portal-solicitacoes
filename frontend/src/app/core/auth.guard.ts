import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';

// Protege as telas internas: sem sessão, vai para o login e guarda a página pedida.
export const authGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);

  return inject(AuthService)
    .loadUser()
    .pipe(
      map((user) =>
        user ? true : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } }),
      ),
    );
};

// O contrário, para a tela de login: quem já tem sessão vai direto para o início.
export const guestGuard: CanActivateFn = () => {
  const router = inject(Router);

  return inject(AuthService)
    .loadUser()
    .pipe(map((user) => (user ? router.createUrlTree(['/']) : true)));
};
