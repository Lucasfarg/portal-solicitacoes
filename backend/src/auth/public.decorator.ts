import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Toda rota exige sessão; esta marca as exceções (login e health).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
