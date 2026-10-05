import { BadRequestException } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';

export class MalformedRequestException extends BadRequestException {
  constructor() {
    super('Requisição malformada: o corpo não é um JSON válido ou a URL está mal codificada');
  }
}

// O Nest repassa JSON/URL malformados com a mensagem crua do parser, em inglês; aqui viram erro nosso, em português.
export class PortalExpressAdapter extends ExpressAdapter {
  override mapException(error: unknown): unknown {
    if (error instanceof SyntaxError || error instanceof URIError) {
      return new MalformedRequestException();
    }
    return super.mapException(error);
  }
}
