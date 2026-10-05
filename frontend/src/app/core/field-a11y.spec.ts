import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { PoFieldModule } from '@po-ui/ng-components';
import { FieldA11y, focusFirstInvalid } from './field-a11y';
import { FieldError } from './field-error';

@Component({
  imports: [ReactiveFormsModule, FieldA11y, FieldError],
  template: `
    <form [formGroup]="form">
      <input id="first" formControlName="first" />
      <input id="name" formControlName="name" appErrorId="name-error" />
      <app-field-error id="name-error" [control]="form.controls.name" />
      <input
        id="described"
        formControlName="described"
        aria-describedby="described-help"
        appErrorId="described-error"
      />
    </form>
  `,
})
class Host {
  readonly form = new FormGroup({
    first: new FormControl('preenchido'),
    name: new FormControl('', Validators.required),
    described: new FormControl('ok'),
  });
}

// Um po-input de verdade: a diretiva depende do <input> que o PO UI renderiza por dentro.
@Component({
  imports: [ReactiveFormsModule, PoFieldModule, FieldA11y, FieldError],
  template: `
    <po-input [formControl]="title" p-label="Título" appErrorId="title-error" />
    <app-field-error id="title-error" [control]="title" />
  `,
})
class PoInputHost {
  readonly title = new FormControl('', Validators.required);
}

describe('FieldA11y', () => {
  let fixture: ComponentFixture<Host>;
  let element: HTMLElement;
  const name = () => element.querySelector<HTMLInputElement>('#name')!;

  beforeEach(() => {
    fixture = TestBed.createComponent(Host);
    element = fixture.nativeElement as HTMLElement;
    // O foco só funciona com o elemento dentro do documento.
    document.body.append(element);
    fixture.detectChanges();
  });

  afterEach(() => element.remove());

  it('aponta o campo para a mensagem de erro e não o marca inválido antes de ser tocado', () => {
    expect(name().getAttribute('aria-describedby')).toBe('name-error');
    expect(name().getAttribute('aria-invalid')).toBe('false');
  });

  it('soma a mensagem ao que o campo já descrevia, sem repetir a cada renderização', () => {
    TestBed.tick();
    const described = element.querySelector('#described')!;

    expect(described.getAttribute('aria-describedby')).toBe('described-help described-error');
  });

  it('marca o campo como inválido depois de tocado, junto com a mensagem', () => {
    fixture.componentInstance.form.markAllAsTouched();
    fixture.detectChanges();
    // No app, cada evento termina num tick do Angular, que é quando a diretiva regrava os atributos.
    TestBed.tick();

    expect(name().getAttribute('aria-invalid')).toBe('true');
    expect(element.querySelector('#name-error')?.textContent).toContain('Campo inválido');
  });

  it('focusFirstInvalid leva o foco ao primeiro campo com erro, pulando os válidos', () => {
    focusFirstInvalid(element);

    expect(document.activeElement).toBe(name());
  });
});

// Se uma versão nova do PO UI mudar o HTML de dentro do po-input, este teste quebra antes que
// a ligação entre o campo e a mensagem de erro se perca em silêncio.
describe('FieldA11y no po-input do PO UI', () => {
  it('grava aria-describedby e aria-invalid no <input> de dentro do componente', () => {
    const fixture = TestBed.createComponent(PoInputHost);
    fixture.detectChanges();
    fixture.componentInstance.title.markAsTouched();
    fixture.detectChanges();
    TestBed.tick();

    const input = (fixture.nativeElement as HTMLElement).querySelector('po-input input');
    expect(input).not.toBeNull();
    expect(input?.getAttribute('aria-describedby')?.split(' ')).toContain('title-error');
    expect(input?.getAttribute('aria-invalid')).toBe('true');
  });
});
