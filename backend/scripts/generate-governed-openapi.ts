/**
 * Gera spec OpenAPI escopada para contratos governados cross-cutting:
 * - GovernedPdfAccessResponseDto (usado por 9+ módulos)
 * - DocumentMailDispatchResponseDto (usado por mail dispatch)
 *
 * Estes DTOs são registrados via @ApiExtraModels — não precisam de
 * controllers reais porque servem como contratos de schema compartilhados.
 */
import 'reflect-metadata';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  DocumentBuilder,
  getSchemaPath,
  SwaggerModule,
} from '@nestjs/swagger';
import { GovernedPdfAccessResponseDto } from '../src/common/dto/governed-pdf-access-response.dto';
import { DocumentMailDispatchResponseDto } from '../src/mail/dto/document-mail-dispatch-response.dto';

/**
 * Controller virtual — existe apenas para que o SwaggerModule emita os schemas
 * referenciados em @ApiExtraModels. As rotas nunca são acessadas em runtime.
 */
@ApiTags('governed-contracts')
@ApiExtraModels(GovernedPdfAccessResponseDto, DocumentMailDispatchResponseDto)
@Controller('_schema')
class GovernedContractsSchemaController {
  @Get('pdf-access')
  @ApiOperation({ summary: 'Schema: resposta de acesso a PDF governado' })
  @ApiOkResponse({
    description: 'Formato canônico de resposta de acesso a PDF.',
    type: GovernedPdfAccessResponseDto,
  })
  pdfAccess(): GovernedPdfAccessResponseDto {
    throw new Error('Schema-only endpoint');
  }

  @Get('mail-dispatch')
  @ApiOperation({ summary: 'Schema: resposta de envio de e-mail documental' })
  @ApiOkResponse({
    description: 'Formato canônico de resposta de mail dispatch.',
    type: DocumentMailDispatchResponseDto,
  })
  mailDispatch(): DocumentMailDispatchResponseDto {
    throw new Error('Schema-only endpoint');
  }
}

@Module({
  controllers: [GovernedContractsSchemaController],
})
class GovernedContractsOpenApiModule {}

async function main() {
  const app = await NestFactory.create(GovernedContractsOpenApiModule, {
    logger: false,
  });
  await app.init();

  const config = new DocumentBuilder()
    .setTitle('API Sistema Wanderson-Gandra - Contratos Governados')
    .setDescription(
      'Schema OpenAPI para contratos cross-cutting compartilhados entre módulos: ' +
        'resposta de PDF governado e dispatch de e-mail documental.',
    )
    .setVersion('1.0')
    .addTag(
      'governed-contracts',
      'Schemas compartilhados de contratos governados',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [
      GovernedPdfAccessResponseDto,
      DocumentMailDispatchResponseDto,
    ],
  });

  const outputDir = path.resolve(__dirname, '../openapi');
  const outputFile = path.join(outputDir, 'governed-contracts.openapi.json');

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputFile, `${JSON.stringify(document, null, 2)}\n`);

  await app.close();

  process.stdout.write(`OpenAPI exportado em ${outputFile}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Falha ao exportar OpenAPI: ${error instanceof Error ? error.stack || error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
