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
  Request as NestRequest,
  UploadedFile,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request as ExpressRequest } from 'express';
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
import { AiConsentGuard } from '../../common/guards/ai-consent.guard';
import { UserThrottle } from '../../common/decorators/user-throttle.decorator';
import { TenantThrottle } from '../../common/decorators/tenant-throttle.decorator';
import {
  cleanupUploadedTempFile,
  fileUploadOptions,
  inspectUploadedFileBuffer,
  readUploadedFileBuffer,
  validateFileMagicBytes,
} from '../../common/interceptors/file-upload.interceptor';
import { FileInspectionService } from '../../common/security/file-inspection.service';

interface SstAgentRequestUser {
  sub?: string;
  id?: string;
  userId?: string;
}

type SstAgentRequest = ExpressRequest & {
  user?: SstAgentRequestUser;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getSstAgentUserId = (request: SstAgentRequest): string => {
  const userId = String(
    request.user?.userId ?? request.user?.sub ?? request.user?.id ?? '',
  ).trim();
  if (!UUID_PATTERN.test(userId)) {
    throw new UnauthorizedException('Usuário autenticado inválido.');
  }
  return userId;
};

/**
 * Controller do Agente SST.
 *
 * Rotas sob /ai/sst — isoladas das rotas do AiController genérico.
 * Acesso restrito a perfis habilitados: ADMIN_GERAL, ADMIN_EMPRESA, TST.
 */
@Controller('ai/sst')
@UseGuards(
  FeatureAiGuard,
  JwtAuthGuard,
  AiConsentGuard,
  TenantGuard,
  RolesGuard,
)
@UseInterceptors(TenantInterceptor)
export class SstAgentController {
  constructor(
    private readonly sstAgentService: SstAgentService,
    private readonly fileInspectionService: FileInspectionService,
  ) {}

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
  @UserThrottle({ requestsPerMinute: 10 })
  @TenantThrottle({ requestsPerMinute: 60, requestsPerHour: 600 })
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async chat(@Body() dto: SstChatDto, @NestRequest() req: SstAgentRequest) {
    const userId = getSstAgentUserId(req);
    return this.sstAgentService.chat(dto.question, userId, dto.history ?? []);
  }

  @Post('analyze-image-risk')
  @UserThrottle({ requestsPerMinute: 5 })
  @TenantThrottle({ requestsPerMinute: 30, requestsPerHour: 200 })
  @UseInterceptors(FileInterceptor('image', fileUploadOptions))
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_use_ai')
  async analyzeImageRisk(
    @UploadedFile() file: Express.Multer.File,
    @Body('context') context: string | undefined,
    @NestRequest() req: SstAgentRequest,
  ) {
    if (!file) {
      throw new BadRequestException('Imagem nao enviada.');
    }

    const buffer = await readUploadedFileBuffer(file);

    try {
      validateFileMagicBytes(buffer, ['image/jpeg', 'image/png', 'image/webp']);
      await inspectUploadedFileBuffer(buffer, file, this.fileInspectionService);

      const userId = getSstAgentUserId(req);
      return this.sstAgentService.analyzeImageRisk(
        buffer,
        file.mimetype,
        userId,
        context,
      );
    } finally {
      await cleanupUploadedTempFile(file);
    }
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
    @NestRequest() req: SstAgentRequest,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('days') days?: string,
  ) {
    const parsedDays = this.parseOptionalPositiveInt(days, 'days');
    const userId = getSstAgentUserId(req);
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
