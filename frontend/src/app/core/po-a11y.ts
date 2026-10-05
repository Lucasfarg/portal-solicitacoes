import { Directive, ElementRef, afterEveryRender, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { PoPageDefaultComponent } from '@po-ui/ng-components';

// Ajustes de acessibilidade por cima de componentes do PO UI. Cada diretiva grava, depois de
// cada renderização, os atributos que o componente não oferece; nenhuma troca o componente
// nem o que ele desenha. Os defeitos que daqui não dão para consertar estão no memorial
// técnico, na seção "Limitações".

// Faz de um elemento só de clique (um div, um ícone) um botão que o teclado alcança: foco com
// Tab, Enter e Espaço acionam o clique, e o leitor de tela o anuncia com nome e função.
function asButton(element: HTMLElement, label: string): void {
  element.setAttribute('role', 'button');
  element.setAttribute('tabindex', '0');
  element.setAttribute('aria-label', label);
  if (element.dataset['keyboard']) {
    return;
  }
  element.dataset['keyboard'] = 'true';
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      element.click();
    }
  });
}

// po-toolbar: a barra é um div sem região (vira "banner") e o perfil, que abre o menu com
// "Sair", só responde ao mouse.
@Directive({ selector: 'po-toolbar[appToolbarA11y]', host: { role: 'banner' } })
export class ToolbarA11y {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterEveryRender(() => {
      const profile = this.host.nativeElement.querySelector<HTMLElement>('.po-toolbar-profile');
      if (profile) {
        asButton(profile, 'Menu do usuário');
        profile.setAttribute('aria-haspopup', 'listbox');
      }
    });
  }
}

// po-menu: o <nav> não tem nome, o item da tela atual só é marcado por cor, Enter e Espaço num
// item não navegam (o componente cancela a tecla e só marca o item), o botão que abre o menu
// no celular só responde ao mouse, e há atributos ARIA que o elemento não admite.
@Directive({
  selector: 'po-menu[appMenuA11y]',
  host: { '(window:resize)': 'adjust()', '(keydown)': 'navigate($event)' },
})
export class MenuA11y {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly router = inject(Router);

  constructor() {
    afterEveryRender(() => this.adjust());
  }

  protected navigate(event: KeyboardEvent): void {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a.po-menu-item-link');
    const path = link?.getAttribute('href');
    // defaultPrevented: foi o componente que cancelou a tecla; com Ctrl ele a deixa passar, e
    // o navegador cuida.
    if (
      event.defaultPrevented &&
      (event.key === 'Enter' || event.key === ' ') &&
      path?.startsWith('/')
    ) {
      void this.router.navigateByUrl(path);
    }
  }

  protected adjust(): void {
    const element = this.host.nativeElement;
    element.querySelector('nav')?.setAttribute('aria-label', 'Menu principal');
    // aria-expanded não existe num <div> sem função, e aria-level não vale num item
    // "presentation".
    element.querySelector('.po-menu')?.removeAttribute('aria-expanded');
    for (const item of element.querySelectorAll('li[role="presentation"][aria-level]')) {
      item.removeAttribute('aria-level');
    }
    for (const link of element.querySelectorAll('a.po-menu-item-link')) {
      if (link.querySelector('.po-menu-item-selected')) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    }
    const toggle = element.querySelector<HTMLElement>('.po-menu-mobile');
    if (!toggle) {
      return;
    }
    const open = !!element.querySelector('.po-menu-overlay');
    asButton(toggle, 'Menu');
    toggle.setAttribute('aria-expanded', String(open));
    // No celular o menu fechado só sai da vista (fica fora da tela): sem o inert, o Tab
    // continuaria parando nos itens invisíveis.
    const onPhone = toggle.getClientRects().length > 0;
    element.querySelector('.po-menu')?.toggleAttribute('inert', onPhone && !open);
  }
}

// po-page-default: o título é um <h2> (a tela ficaria sem <h1>), e o último item da trilha de
// navegação é uma parada de Tab sem função, com aria-current igual ao texto. Também põe o
// título da tela na aba do navegador.
@Directive({ selector: 'po-page-default[appPageA11y]' })
export class PageA11y {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly page = inject(PoPageDefaultComponent);

  constructor() {
    const browserTitle = inject(Title);
    afterEveryRender(() => {
      browserTitle.setTitle(`${this.page.title} — Portal`);
      const element = this.host.nativeElement;
      const heading = element.querySelector('.po-page-header-title');
      heading?.setAttribute('role', 'heading');
      heading?.setAttribute('aria-level', '1');
      heading?.setAttribute('tabindex', '-1');
      const current = element.querySelector('.po-breadcrumb-item-activate');
      current?.removeAttribute('role');
      current?.removeAttribute('tabindex');
      current?.setAttribute('aria-current', 'page');
    });
  }

  // Para a tela devolver o foco ao título quando o botão que o tinha sai da tela.
  focusTitle(): void {
    this.host.nativeElement.querySelector<HTMLElement>('.po-page-header-title')?.focus();
  }
}

// po-login e po-password: o componente só aceita ligar ou desligar o autocomplete, e o
// navegador precisa de "username" e "current-password" para preencher e salvar o login.
@Directive({ selector: 'po-login[appAutocomplete], po-password[appAutocomplete]' })
export class FieldAutocomplete {
  readonly token = input.required<string>({ alias: 'appAutocomplete' });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterEveryRender(() => {
      this.host.nativeElement.querySelector('input')?.setAttribute('autocomplete', this.token());
    });
  }
}

// po-password: o ícone do olho, que mostra a senha, só responde ao mouse. Aqui ele vira um
// botão; o nome diz o que ele faz agora.
@Directive({ selector: 'po-password[appPasswordPeek]' })
export class PasswordPeekA11y {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterEveryRender(() => {
      const element = this.host.nativeElement;
      const peek = element.querySelector<HTMLElement>('.po-field-icon-container-right po-icon');
      const visible = element.querySelector('input')?.type === 'text';
      if (peek) {
        asButton(peek, visible ? 'Ocultar senha' : 'Mostrar senha');
      }
    });
  }
}

// po-table: a área que rola de lado quando a tabela não cabe não recebe foco (o teclado não
// a alcança quando não há link dentro dela) nem tem nome. Aqui ela vira uma região nomeada.
@Directive({ selector: 'po-table[appTableLabel]' })
export class TableA11y {
  readonly label = input.required<string>({ alias: 'appTableLabel' });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterEveryRender(() => {
      const scroller = this.host.nativeElement.querySelector('.po-table-main-container');
      scroller?.setAttribute('role', 'region');
      scroller?.setAttribute('tabindex', '0');
      scroller?.setAttribute('aria-label', this.label());
    });
  }
}

// po-checkbox: o quadrado desenhado ao lado do <input> leva aria-checked e aria-label sem ter
// função; quem o leitor de tela lê é o <input>, com o rótulo do campo.
@Directive({ selector: 'po-checkbox[appCheckboxA11y]' })
export class CheckboxA11y {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterEveryRender(() => {
      const box = this.host.nativeElement.querySelector('span.po-checkbox');
      box?.removeAttribute('aria-checked');
      box?.removeAttribute('aria-label');
    });
  }
}

// po-datepicker: os seletores de mês e ano do calendário não têm rótulo, e o campo de texto
// leva aria-expanded sem ter função de combobox. O calendário só existe aberto; a data também
// pode ser digitada no campo (dd/mm/aaaa).
@Directive({ selector: 'po-datepicker[appDatepickerA11y]' })
export class DatepickerA11y {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterEveryRender(() => {
      const element = this.host.nativeElement;
      element.querySelector('input.po-datepicker')?.removeAttribute('aria-expanded');
      element.querySelector('input[name^="month"]')?.setAttribute('aria-label', 'Mês');
      element.querySelector('input[name^="year"]')?.setAttribute('aria-label', 'Ano');
    });
  }
}
