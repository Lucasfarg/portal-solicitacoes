import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthUser, LoginInput } from '@portal/shared';
import { Observable, catchError, of, tap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  // undefined: a API ainda não foi consultada; null: não há sessão.
  private readonly state = signal<AuthUser | null | undefined>(undefined);

  readonly user = computed(() => this.state() ?? null);

  // O cookie de sessão é HttpOnly: o front pergunta à API uma vez e guarda o resultado.
  loadUser(): Observable<AuthUser | null> {
    const known = this.state();
    if (known !== undefined) {
      return of(known);
    }
    return this.http.get<AuthUser>('/api/auth/me').pipe(
      catchError(() => of(null)),
      tap((user) => this.state.set(user)),
    );
  }

  login(input: LoginInput): Observable<AuthUser> {
    return this.http
      .post<AuthUser>('/api/auth/login', input)
      .pipe(tap((user) => this.state.set(user)));
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', null).pipe(tap(() => this.state.set(null)));
  }

  // Qualquer chamada autenticada renova a sessão no servidor.
  keepAlive(): Observable<AuthUser> {
    return this.http.get<AuthUser>('/api/auth/me');
  }

  clear(): void {
    this.state.set(null);
  }
}
