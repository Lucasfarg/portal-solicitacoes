import { hashPassword, verifyPassword } from './password.js';

describe('senhas', () => {
  it('gera hash Argon2id com os parâmetros da OWASP', async () => {
    const hash = await hashPassword('Senha@123');

    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
  });

  it('confere a senha certa e recusa a errada', async () => {
    const hash = await hashPassword('Senha@123');

    await expect(verifyPassword(hash, 'Senha@123')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'senha@123')).resolves.toBe(false);
  });

  it('hash malformado é erro de verdade, não "senha errada"', async () => {
    await expect(verifyPassword('não é um hash', 'Senha@123')).rejects.toThrow();
  });
});
