import { BadRequestException } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';

export class MalformedRequestException extends BadRequestException {
  constructor() {
    super('Requisição malformada: o corpo não é um JSON válido ou a URL está mal codificada');
  }
}

// O Express lança SyntaxError quando o corpo não é JSON válido e URIError quando a URL tem um
// "%" malformado; o adaptador padrão do Nest repassa os dois como BadRequestException com a
// mensagem crua do parser, em inglês. Aqui eles viram um erro nosso, já em português, na
// origem: o filtro de erros não precisa adivinhar de onde veio cada 400.
export class PortalExpressAdapter extends ExpressAdapter {
  override mapException(error: unknown): unknown {
    if (error instanceof SyntaxError || error instanceof URIError) {
      return new MalformedRequestException();
    }
    return super.mapException(error);
  }
}
