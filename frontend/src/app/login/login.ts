import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PoPageLogin, PoPageLoginLiterals, PoPageLoginModule } from '@po-ui/ng-templates';
import { errorMessage } from '../core/api-error';
import { AuthService } from '../core/auth.service';

// Tela de login sobre o po-page-login, o template de login do PO UI: o layout, os campos e a
// validação de preenchimento são dele; aqui ficam os textos e a chamada à API.
@Component({
  selector: 'app-login',
  imports: [PoPageLoginModule],
  templateUrl: './login.html',
  styles: `
    main {
      display: block;
    }

    // Só para o leitor de tela: a mensagem visível é a do campo.
    .login-failure {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly literals: PoPageLoginLiterals = {
    // Ambiente de demonstração: quem avalia entra sem precisar abrir o README.
    welcome: 'Use ana, bruno ou carla com a senha Senha@123',
    loginLabel: 'Usuário',
    loginPlaceholder: 'Seu usuário',
    loginHint: 'ana e bruno são colaboradores; carla é atendente.',
    passwordLabel: 'Senha',
    passwordPlaceholder: 'Sua senha',
    submitLabel: 'Entrar',
    submittedLabel: 'Entrando…',
    highlightInfo: 'Solicitações para TI, RH, Compras, Financeiro e Infraestrutura',
  };

  protected readonly loading = signal(false);
  // Resposta da API quando o login falha (senha errada, muitas tentativas). Some quando a
  // pessoa volta a digitar: com um erro no campo, o po-page-login mantém o botão desabilitado.
  protected readonly failure = signal<string | null>(null);
  protected readonly errors = computed(() => {
    const message = this.failure();
    return message ? [message] : [];
  });

  protected submit(form: PoPageLogin): void {
    // Um segundo Enter enquanto a API responde não envia de novo.
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.failure.set(null);
    this.auth.login({ username: form.login, password: form.password }).subscribe({
      next: () => {
        // Volta para a página que a pessoa tentou abrir antes de cair no login.
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
        void this.router.navigateByUrl(returnUrl);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.failure.set(errorMessage(error));
        // Com o erro o botão fica desabilitado e perderia o foco: ele vai para a senha.
        this.host.nativeElement.querySelector<HTMLElement>('po-password input')?.focus();
      },
    });
  }
}
