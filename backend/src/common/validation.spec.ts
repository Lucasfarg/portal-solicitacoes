import { loginSchema } from '@portal/shared';
import { createValidationPipe, ValidationException } from './validation.js';

// O mesmo schema de shared/ que valida o formulário no Angular valida o corpo na API.
describe('validação com schemas de @portal/shared', () => {
  const pipe = createValidationPipe();
  const metadata = { type: 'body', schema: loginSchema } as const;

  it('aceita e normaliza um corpo válido', async () => {
    const body = { username: '  Ana  ', password: 'segredo' };

    await expect(pipe.transform(body, metadata)).resolves.toEqual({
      username: 'ana',
      password: 'segredo',
    });
  });

  it('rejeita com 400 e lista os campos inválidos', async () => {
    const body = { username: '', password: '' };

    const error = await pipe.transform(body, metadata).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationException);
    expect((error as ValidationException).issues).toEqual([
      { path: 'username', message: 'Informe o usuário' },
      { path: 'password', message: 'Informe a senha' },
    ]);
  });
});
