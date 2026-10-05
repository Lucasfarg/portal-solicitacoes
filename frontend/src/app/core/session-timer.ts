import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PoNotificationService } from '@po-ui/ng-components';
import { AuthService } from './auth.service';

// A API encerra a sessão depois de alguns minutos sem chamadas e informa em cada resposta
// quantos são e quanto falta (cabeçalhos SESSION_IDLE_HEADER e SESSION_REMAINING_HEADER, lidos
// pelo interceptor). Sem os cabeçalhos, vale o padrão da API com o tempo inteiro. O aviso sai
// 5 minutos antes do fim, ou na metade do tempo, se a sessão for curta.
export const DEFAULT_IDLE_MINUTES = 30;
export const WARN_BEFORE_MINUTES = 5;
const MINUTE_MS = 60 * 1000;

// Conta o tempo desde a última resposta da API, avisa quando a sessão está perto de expirar
// e, passado o tempo da sessão, encerra a sessão também na tela: quem ignorou o aviso não fica
// com os dados à mostra. Quem mostra o aviso é o Shell (layout/shell.ts).
@Injectable({ providedIn: 'root' })
export class SessionTimer {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notification = inject(PoNotificationService);

  readonly expiring = signal(false);
  // Minutos sem uso que encerram a sessão; o aviso do Shell mostra esse número.
  readonly idleMinutes = signal(DEFAULT_IDLE_MINUTES);

  private warnTimer?: ReturnType<typeof setTimeout>;
  private expireTimer?: ReturnType<typeof setTimeout>;

  // O interceptor chama a cada resposta da API, com o que falta para a sessão expirar.
  restart(idleMinutes = DEFAULT_IDLE_MINUTES, remainingMs = idleMinutes * MINUTE_MS): void {
    this.stop();
    this.idleMinutes.set(idleMinutes);
    const warnBeforeMs = Math.min(WARN_BEFORE_MINUTES * MINUTE_MS, (idleMinutes * MINUTE_MS) / 2);
    const warnAfterMs = Math.max(0, remainingMs - warnBeforeMs);
    this.warnTimer = setTimeout(() => this.expiring.set(true), warnAfterMs);
    this.expireTimer = setTimeout(() => this.expire(), remainingMs);
  }

  // Sem sessão (saiu ou expirou) não há o que avisar.
  stop(): void {
    clearTimeout(this.warnTimer);
    clearTimeout(this.expireTimer);
    this.expiring.set(false);
  }

  // A sessão acabou: pela contagem daqui, por um 401 da API ou porque o "Continuar
  // conectado" chegou tarde. Limpa o usuário, avisa uma vez e leva ao login, guardando
  // para onde voltar. Várias chamadas seguidas (uma tela com várias requisições) avisam uma vez.
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
