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
    document.body.append(element);
    fixture.detectChanges();
  });

  afterEach(() => element.remove());

  it('marca o campo como inválido depois de tocado, junto com a mensagem', () => {
    fixture.componentInstance.form.markAllAsTouched();
    fixture.detectChanges();
    TestBed.tick();

    expect(name().getAttribute('aria-invalid')).toBe('true');
    expect(element.querySelector('#name-error')?.textContent).toContain('Campo inválido');
  });

  it('focusFirstInvalid leva o foco ao primeiro campo com erro, pulando os válidos', () => {
    focusFirstInvalid(element);

    expect(document.activeElement).toBe(name());
  });
});

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
