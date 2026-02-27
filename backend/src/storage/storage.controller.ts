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
import { StorageService } from '../common/services/storage.service';
import { randomUUID } from 'crypto';

@Controller('storage')
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantInterceptor)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('presigned-url')
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

    // Gerar key única para o arquivo
    const fileExtension = body.filename.split('.').pop() || 'pdf';
    const uniqueKey = `documents/${randomUUID()}.${fileExtension}`;

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
