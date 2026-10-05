import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { PoNotificationService } from '@po-ui/ng-components';

import { routes } from './app.routes';
import { apiInterceptor } from './core/api.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // O PO UI 21 depende do zone.js; por isso o app não é zoneless.
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([apiInterceptor])),
    // Janelas de confirmação e avisos do PO UI usam as animações do Angular.
    provideAnimationsAsync(),
    // Os avisos somem sozinhos; os 9 segundos padrão do PO UI são pouco para ler uma mensagem
    // de erro mais longa (WCAG 2.2.1, tempo suficiente). Vale para todos os avisos do app.
    provideAppInitializer(() => inject(PoNotificationService).setDefaultDuration(15_000)),
  ],
};
