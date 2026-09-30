import { TestBed } from '@angular/core/testing';
import { REQUEST_STATUS_LABELS } from '@portal/shared';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('cria o app', () => {
    const fixture = TestBed.createComponent(App);

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('mostra as situações vindas de shared em componentes PO UI', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelectorAll('po-tag').length).toBe(3);
    expect(compiled.textContent).toContain(REQUEST_STATUS_LABELS.IN_PROGRESS);
  });
});
