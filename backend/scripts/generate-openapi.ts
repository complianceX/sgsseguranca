import 'reflect-metadata';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { ExecutionContext } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { DocumentImportController } from '../src/document-import/controllers/document-import.controller';
import { DocumentImportService } from '../src/document-import/services/document-import.service';
import { TenantService } from '../src/common/tenant/tenant.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
import { PermissionsGuard } from '../src/auth/permissions.guard';
import { RbacService } from '../src/rbac/rbac.service';
import { TenantGuard } from '../src/common/guards/tenant.guard';
import { TenantInterceptor } from '../src/common/tenant/tenant.interceptor';
import { FileInspectionService } from '../src/common/security/file-inspection.service';

@Module({
  controllers: [DocumentImportController],
  providers: [
    {
      provide: DocumentImportService,
      useValue: {
        enqueueDocumentProcessing: async () => null,
        getDocumentStatusResponse: async () => null,
        getDdsDraftPreview: async () => null,
        createDdsDraftFromImport: async () => null,
      },
    },
    {
      provide: TenantService,
      useValue: {
        getTenantId: () => undefined,
        isSuperAdmin: () => false,
      },
    },
    {
      provide: FileInspectionService,
      useValue: {
        inspect: async () => undefined,
      },
    },
    {
      provide: JwtAuthGuard,
      useValue: {
        canActivate: (_context: ExecutionContext) => true,
      },
    },
    {
      provide: RolesGuard,
      useValue: {
        canActivate: (_context: ExecutionContext) => true,
      },
    },
    {
      provide: PermissionsGuard,
      useValue: {
        canActivate: (_context: ExecutionContext) => true,
      },
    },
    {
      provide: RbacService,
      useValue: {
        getUserAccess: async () => ({ roles: [], permissions: [] }),
      },
    },
    {
      provide: TenantGuard,
      useValue: {
        canActivate: (_context: ExecutionContext) => true,
      },
    },
    {
      provide: TenantInterceptor,
      useValue: {
        intercept: (
          _context: ExecutionContext,
          next: { handle: () => Observable<unknown> },
        ) => next.handle(),
      },
    },
  ],
})
class DocumentImportOpenApiModule {}

async function main() {
  const app = await NestFactory.create(DocumentImportOpenApiModule, {
    abortOnError: false,
    logger: false,
  });
  await app.init();

  const config = new DocumentBuilder()
    .setTitle('API Sistema Wanderson-Gandra - Importação Documental')
    .setDescription(
      'Schema OpenAPI escopado para o fluxo de Importação Documental.',
    )
    .setVersion('1.0')
    .addTag('document-import', 'Fluxo de importação documental')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const outputDir = path.resolve(__dirname, '../openapi');
  const outputFile = path.join(outputDir, 'document-import.openapi.json');

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
