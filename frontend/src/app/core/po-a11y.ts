import { Directive, ElementRef, afterEveryRender, inject, input } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { PoPageDefaultComponent } from '@po-ui/ng-components';

// Ajustes de acessibilidade por cima de componentes do PO UI: cada diretiva grava, após cada
// renderização, os atributos que o componente não oferece.

// Transforma um elemento só de clique em botão alcançável pelo teclado (Tab, Enter e Espaço).
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

// po-toolbar: a barra não é uma região (vira "banner") e o perfil só responde ao mouse.
@Directive({ selector: 'po-toolbar[appToolbarA11y]', host: { role: 'banner' } })
export class ToolbarA11y {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterEveryRender(() => {
      const profile = this.host.nativeElement.querySelector<HTMLElement>('.po-toolbar-profile');
      if (profile) {
        asButton(profile, 'Menu do usuário');
        profile.setAttribute('aria-haspopup', 'listbox');
        if (!profile.dataset['focusPopup']) {
          profile.dataset['focusPopup'] = 'true';
          profile.addEventListener('keydown', (event) => this.focusFirstOption(event));
        }
      }
    });
  }

  // Aberto pelo teclado, o menu do usuário não recebe o foco: o Tab seguinte cairia no começo
  // da página, sem passar por "Sair". O foco vai para a primeira opção assim que ela existe.
  private focusFirstOption(event: KeyboardEvent, attempt = 0): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    const option = document.querySelector<HTMLElement>('po-popup [role="option"]');
    if (option) {
      option.focus();
    } else if (attempt < 10) {
      setTimeout(() => this.focusFirstOption(event, attempt + 1), 50);
    }
  }
}

// po-menu: a navegação não tem nome, o item atual só é marcado por cor, Enter e Espaço nos
// itens não navegam e o botão do menu no celular só responde ao mouse.
@Directive({
  selector: 'po-menu[appMenuA11y]',
  host: {
    role: 'navigation',
    'aria-label': 'Menu principal',
    '(window:resize)': 'adjust()',
    '(keydown)': 'navigate($event)',
  },
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
    // defaultPrevented: o componente cancelou a tecla; com Ctrl ele deixa passar.
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
    element.querySelector('nav')?.setAttribute('role', 'presentation');
    // A marca é um link para o início, igual ao item "Painel": fica fora do Tab e da leitura.
    const logo = element.querySelector('.po-menu-header-container-logo a');
    logo?.setAttribute('tabindex', '-1');
    logo?.setAttribute('aria-hidden', 'true');
    // aria-expanded não vale num <div> sem função, nem aria-level num item "presentation".
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
    // No celular o menu fechado só sai da tela; sem o inert o Tab para nos itens invisíveis.
    const onPhone = toggle.getClientRects().length > 0;
    element.querySelector('.po-menu')?.toggleAttribute('inert', onPhone && !open);
  }
}

// po-page-default: o título é um <h2> (a tela fica sem <h1>) e o último item da trilha é uma
// parada de Tab sem função.
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

  focusTitle(): void {
    this.host.nativeElement.querySelector<HTMLElement>('.po-page-header-title')?.focus();
  }
}

// po-table: a área com rolagem lateral não recebe foco nem tem nome.
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

// po-checkbox: o quadrado ao lado do <input> leva aria-checked e aria-label sem função.
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

// po-datepicker: os seletores de mês e ano não têm rótulo e o campo leva aria-expanded sem
// ser combobox.
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

// po-chart: o botão que mostra os dados do gráfico em tabela é só um ícone, sem nome.
@Directive({ selector: 'po-chart[appChartA11y]' })
export class ChartA11y {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterEveryRender(() => {
      const buttons = this.host.nativeElement.querySelectorAll('.po-chart-header-actions button');
      for (const button of buttons) {
        button.setAttribute('aria-label', 'Ver os dados do gráfico em tabela');
      }
    });
  }
}
