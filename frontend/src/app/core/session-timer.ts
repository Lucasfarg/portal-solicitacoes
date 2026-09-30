import { Injectable, signal } from '@angular/core';

// A API encerra a sessão depois de 30 minutos sem chamadas (SESSION_IDLE_MINUTES, em
// backend/src/config/env.ts). O aviso sai 5 minutos antes, para dar tempo de continuar.
export const WARN_AFTER_MS = 25 * 60 * 1000;

// Conta o tempo desde a última resposta da API e avisa quando a sessão está perto de expirar.
// Quem mostra o aviso é o Shell (layout/shell.ts).
@Injectable({ providedIn: 'root' })
export class SessionTimer {
  readonly expiring = signal(false);

  private timer?: ReturnType<typeof setTimeout>;

  // O interceptor chama a cada resposta da API: o servidor acabou de renovar a sessão.
  restart(): void {
    this.stop();
    this.timer = setTimeout(() => this.expiring.set(true), WARN_AFTER_MS);
  }

  // Sem sessão (saiu ou expirou) não há o que avisar.
  stop(): void {
    clearTimeout(this.timer);
    this.expiring.set(false);
  }
}
