import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';

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

export const guestGuard: CanActivateFn = () => {
  const router = inject(Router);

  return inject(AuthService)
    .loadUser()
    .pipe(map((user) => (user ? router.createUrlTree(['/']) : true)));
};
