import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FieldA11y, focusFirstInvalid } from './field-a11y';
import { FieldError } from './field-error';

@Component({
  imports: [ReactiveFormsModule, FieldA11y, FieldError],
  template: `
    <form [formGroup]="form">
      <input id="first" formControlName="first" />
      <input id="name" formControlName="name" appErrorId="name-error" />
      <app-field-error id="name-error" [control]="form.controls.name" />
    </form>
  `,
})
class Host {
  readonly form = new FormGroup({
    first: new FormControl('preenchido'),
    name: new FormControl('', Validators.required),
  });
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
