import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { StorageService } from '../common/services/storage.service';
import { randomUUID } from 'crypto';
import { TenantService } from '../common/tenant/tenant.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { Authorize } from '../auth/authorize.decorator';

@Controller('storage')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class StorageController {
  constructor(
    private readonly storageService: StorageService,
    private readonly tenantService: TenantService,
  ) {}

  @Post('presigned-url')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_import_documents')
  async getPresignedUrl(
    @Body() body: { filename: string; contentType?: string },
  ) {
    if (!body.filename) {
      throw new BadRequestException('Filename é obrigatório');
    }

    // Validar tipo de arquivo (apenas PDFs)
    const contentType = body.contentType || 'application/pdf';
    if (contentType !== 'application/pdf') {
      throw new BadRequestException('Apenas arquivos PDF são permitidos');
    }

    const tenantId = this.tenantService.getTenantId();
    const isSuperAdmin = this.tenantService.isSuperAdmin();
    if (!tenantId && !isSuperAdmin) {
      throw new BadRequestException('Contexto de empresa não definido.');
    }
    if (!tenantId && isSuperAdmin) {
      // Admin geral deve escolher um tenant via header x-company-id (TenantMiddleware)
      throw new BadRequestException(
        'Administrador Geral: selecione uma empresa via header x-company-id.',
      );
    }

    // Gerar key única e tenant-scoped para o arquivo
    const fileExtension = body.filename.split('.').pop() || 'pdf';
    const uniqueKey = `documents/${tenantId}/${randomUUID()}.${fileExtension}`;

    // Gerar URL assinada válida por 1 hora
    const uploadUrl = await this.storageService.getPresignedUploadUrl(
      uniqueKey,
      contentType,
      3600,
    );

    return {
      uploadUrl,
      fileKey: uniqueKey,
      expiresIn: 3600,
    };
  }
}
