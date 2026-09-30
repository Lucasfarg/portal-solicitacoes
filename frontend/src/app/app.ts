import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

// A raiz só hospeda o roteador: o login ocupa a tela inteira e as demais telas
// entram dentro do layout (layout/shell.ts).
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {}
