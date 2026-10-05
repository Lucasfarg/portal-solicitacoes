import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PoNotificationService } from '@po-ui/ng-components';
import { AuthService } from './auth.service';

// Sem os cabeçalhos da API, vale este padrão. O aviso sai 5 minutos antes do fim, ou na
// metade do tempo se a sessão for curta.
export const DEFAULT_IDLE_MINUTES = 30;
export const WARN_BEFORE_MINUTES = 5;
const MINUTE_MS = 60 * 1000;

@Injectable({ providedIn: 'root' })
export class SessionTimer {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notification = inject(PoNotificationService);

  readonly expiring = signal(false);
  readonly idleMinutes = signal(DEFAULT_IDLE_MINUTES);

  private warnTimer?: ReturnType<typeof setTimeout>;
  private expireTimer?: ReturnType<typeof setTimeout>;

  restart(idleMinutes = DEFAULT_IDLE_MINUTES, remainingMs = idleMinutes * MINUTE_MS): void {
    this.stop();
    this.idleMinutes.set(idleMinutes);
    const warnBeforeMs = Math.min(WARN_BEFORE_MINUTES * MINUTE_MS, (idleMinutes * MINUTE_MS) / 2);
    const warnAfterMs = Math.max(0, remainingMs - warnBeforeMs);
    this.warnTimer = setTimeout(() => this.expiring.set(true), warnAfterMs);
    this.expireTimer = setTimeout(() => this.expire(), remainingMs);
  }

  stop(): void {
    clearTimeout(this.warnTimer);
    clearTimeout(this.expireTimer);
    this.expiring.set(false);
  }

  // Várias chamadas seguidas (uma tela com várias requisições) avisam uma vez só.
  expire(): void {
    if (!this.auth.user()) {
      return;
    }
    this.auth.clear();
    this.stop();
    this.notification.warning('Sua sessão expirou. Entre de novo para continuar.');
    void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
  }
}
