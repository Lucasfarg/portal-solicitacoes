import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // Os arquivos compartilham um banco só e o limpam entre testes: um de cada vez.
    fileParallelism: false,
    // Subir o container na primeira execução inclui baixar a imagem.
    hookTimeout: 120_000,
  },
});
