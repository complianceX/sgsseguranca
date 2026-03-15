import {
  BadRequestException,
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
  Request,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs/promises';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { TenantInterceptor } from '../../common/tenant/tenant.interceptor';
import { Roles } from '../../auth/roles.decorator';
import { Role } from '../../auth/enums/roles.enum';
import { SstAgentService } from './sst-agent.service';
import { SstChatDto } from '../dto/sst-chat.dto';
import { Authorize } from '../../auth/authorize.decorator';
import { FeatureAiGuard } from '../../common/guards/feature-ai.guard';
import {
  fileUploadOptions,
  validateFileMagicBytes,
} from '../../common/interceptors/file-upload.interceptor';

/**
 * Controller do Agente SST.
 *
 * Rotas sob /ai/sst — isoladas das rotas do AiController genérico.
 * Acesso restrito a perfis habilitados: ADMIN_GERAL, ADMIN_EMPRESA, TST.
 */
@Controller('ai/sst')
@UseGuards(FeatureAiGuard, JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class SstAgentController {
  constructor(private readonly sstAgentService: SstAgentService) {}

  /**
   * POST /ai/sst/chat
   *
   * Envia uma pergunta ao agente SST e recebe resposta estruturada.
   *
   * Body:
   *   - question: string — pergunta do usuário (max 2000 chars)
   *   - history?: ConversationMessage[] — histórico da sessão atual (opcional)
   *
   * Response: SstAgentResponse
   *   - answer: string
   *   - confidence: 'high' | 'medium' | 'low'
   *   - needsHumanReview: boolean
   *   - sources: string[] (ex: ['NR-6', 'NR-7'])
   *   - suggestedActions: SuggestedAction[]
   *   - warnings: string[]
   *   - toolsUsed: string[]
   */
  @Post('chat')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async chat(@Body() dto: SstChatDto, @Request() req: any) {
    const userId: string = req.user?.sub ?? req.user?.id ?? 'unknown';
    return this.sstAgentService.chat(dto.question, userId, dto.history ?? []);
  }

  @Post('analyze-image-risk')
  @UseInterceptors(FileInterceptor('image', fileUploadOptions))
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async analyzeImageRisk(
    @UploadedFile() file: Express.Multer.File,
    @Body('context') context: string | undefined,
    @Request() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('Imagem nao enviada.');
    }

    const buffer =
      file.buffer && file.buffer.length > 0
        ? file.buffer
        : file.path
          ? await fs.readFile(file.path)
          : undefined;

    if (!buffer) {
      throw new BadRequestException('Falha ao ler a imagem enviada.');
    }

    await validateFileMagicBytes(buffer, [
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);

    const userId: string = req.user?.sub ?? req.user?.id ?? 'unknown';
    return this.sstAgentService.analyzeImageRisk(
      buffer,
      file.mimetype,
      userId,
      context,
    );
  }

  /**
   * GET /ai/sst/history
   *
   * Retorna histórico de interações do usuário atual (metadados, sem resposta completa).
   * Isolado por tenant — cada empresa vê apenas suas próprias interações.
   *
   * Query params:
   *   - limit: number (padrão: 20, máximo: 100)
   */
  @Get('history')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async getHistory(
    @Request() req: any,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('days') days?: string,
  ) {
    const parsedDays = this.parseOptionalPositiveInt(days, 'days');
    const userId: string = req.user?.sub ?? req.user?.id ?? 'unknown';
    return this.sstAgentService.getHistory(userId, limit, parsedDays);
  }

  /**
   * GET /ai/sst/history/:id
   *
   * Retorna uma interação completa por ID (incluindo resposta e ferramentas usadas).
   * Garante isolamento de tenant — retorna 404 se o ID pertencer a outro tenant.
   */
  @Get('history/:id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async getInteraction(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.sstAgentService.getInteraction(id);
  }

  private parseOptionalPositiveInt(
    value: string | undefined,
    fieldName: string,
  ): number | undefined {
    if (value === undefined || value === '') {
      return undefined;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException(
        `${fieldName} deve ser um número inteiro positivo.`,
      );
    }

    return parsed;
  }
}
