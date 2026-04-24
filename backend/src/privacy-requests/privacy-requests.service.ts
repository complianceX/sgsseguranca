import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantService } from '../common/tenant/tenant.service';
import { MailService } from '../mail/mail.service';
import { User } from '../users/entities/user.entity';
import {
  PrivacyRequest,
  PrivacyRequestStatus,
} from './entities/privacy-request.entity';
import {
  PrivacyRequestEvent,
  PrivacyRequestEventType,
} from './entities/privacy-request-event.entity';
import { CreatePrivacyRequestDto } from './dto/create-privacy-request.dto';
import { UpdatePrivacyRequestDto } from './dto/update-privacy-request.dto';

const PRIVACY_REQUEST_INTERNAL_SLA_DAYS = 15;

const PRIVACY_REQUEST_STATUS_LABELS: Record<PrivacyRequestStatus, string> = {
  open: 'Aberta',
  in_review: 'Em análise',
  waiting_controller: 'Aguardando controlador',
  fulfilled: 'Atendida',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
};

type RequestActor = {
  userId: string;
  isAdmin: boolean;
};

@Injectable()
export class PrivacyRequestsService {
  private readonly logger = new Logger(PrivacyRequestsService.name);

  constructor(
    @InjectRepository(PrivacyRequest)
    private readonly requestsRepository: Repository<PrivacyRequest>,
    @InjectRepository(PrivacyRequestEvent)
    private readonly eventsRepository: Repository<PrivacyRequestEvent>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly tenantService: TenantService,
    private readonly mailService: MailService,
  ) {}

  private getTenantIdOrThrow(): string {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new UnauthorizedException(
        'Contexto de empresa não identificado para requisição de privacidade.',
      );
    }
    return tenantId;
  }

  private buildDueAt(): Date {
    return new Date(
      Date.now() + PRIVACY_REQUEST_INTERNAL_SLA_DAYS * 24 * 60 * 60 * 1000,
    );
  }

  private async recordEvent(input: {
    request: PrivacyRequest;
    actorUserId: string | null;
    eventType: PrivacyRequestEventType;
    fromStatus?: PrivacyRequestStatus | null;
    toStatus?: PrivacyRequestStatus | null;
    notes?: string | null;
  }): Promise<void> {
    await this.eventsRepository.save(
      this.eventsRepository.create({
        privacy_request_id: input.request.id,
        company_id: input.request.company_id,
        actor_user_id: input.actorUserId,
        event_type: input.eventType,
        from_status: input.fromStatus ?? null,
        to_status: input.toStatus ?? null,
        notes: input.notes?.trim() || null,
      }),
    );
  }

  private async notifyRequesterBestEffort(input: {
    request: PrivacyRequest;
    previousStatus: PrivacyRequestStatus;
  }): Promise<void> {
    const requester = await this.usersRepository.findOne({
      where: {
        id: input.request.requester_user_id,
        company_id: input.request.company_id,
      },
      select: ['id', 'nome', 'email', 'company_id'],
    });

    if (!requester?.email) {
      this.logger.warn({
        event: 'privacy_request_notification_skipped',
        reason: 'requester_without_email',
        privacyRequestId: input.request.id,
        requesterUserId: input.request.requester_user_id,
        companyId: input.request.company_id,
      });
      return;
    }

    const subject = `SGS - Atualização da sua requisição LGPD`;
    const lines = [
      `Olá, ${requester.nome || 'usuário'}.`,
      '',
      'Sua requisição de privacidade/LGPD foi atualizada.',
      '',
      `Protocolo: ${input.request.id}`,
      `Status anterior: ${PRIVACY_REQUEST_STATUS_LABELS[input.previousStatus]}`,
      `Status atual: ${PRIVACY_REQUEST_STATUS_LABELS[input.request.status]}`,
      input.request.response_summary
        ? `Resposta registrada: ${input.request.response_summary}`
        : null,
      '',
      'Acompanhe o protocolo em Configurações > Privacidade e direitos do titular.',
    ].filter((line): line is string => typeof line === 'string');

    try {
      await this.mailService.sendMailSimple(
        requester.email,
        subject,
        lines.join('\n'),
        {
          companyId: input.request.company_id,
          userId: requester.id,
        },
        undefined,
        {
          filename: `privacy-request-${input.request.id}`,
        },
      );
    } catch (error) {
      this.logger.warn({
        event: 'privacy_request_notification_failed',
        privacyRequestId: input.request.id,
        requesterUserId: input.request.requester_user_id,
        companyId: input.request.company_id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async createForCurrentUser(
    userId: string,
    dto: CreatePrivacyRequestDto,
  ): Promise<PrivacyRequest> {
    const tenantId = this.getTenantIdOrThrow();
    const request = this.requestsRepository.create({
      company_id: tenantId,
      requester_user_id: userId,
      type: dto.type,
      status: 'open',
      description: dto.description?.trim() || null,
      response_summary: null,
      handled_by_user_id: null,
      due_at: this.buildDueAt(),
      fulfilled_at: null,
      rejected_at: null,
    });

    const saved = await this.requestsRepository.save(request);
    await this.recordEvent({
      request: saved,
      actorUserId: userId,
      eventType: 'created',
      toStatus: saved.status,
      notes: 'Requisição LGPD criada pelo titular autenticado.',
    });

    return saved;
  }

  async listMine(userId: string): Promise<PrivacyRequest[]> {
    const tenantId = this.getTenantIdOrThrow();
    return this.requestsRepository.find({
      where: {
        company_id: tenantId,
        requester_user_id: userId,
      },
      order: { created_at: 'DESC' },
    });
  }

  async listTenant(): Promise<PrivacyRequest[]> {
    const tenantId = this.getTenantIdOrThrow();
    return this.requestsRepository.find({
      where: { company_id: tenantId },
      order: { due_at: 'ASC', created_at: 'DESC' },
    });
  }

  async listEvents(
    id: string,
    actor: RequestActor,
  ): Promise<PrivacyRequestEvent[]> {
    const request = await this.findOne(id, actor);
    return this.eventsRepository.find({
      where: {
        privacy_request_id: request.id,
        company_id: request.company_id,
      },
      order: { created_at: 'ASC' },
    });
  }

  async findOne(id: string, actor: RequestActor): Promise<PrivacyRequest> {
    const tenantId = this.getTenantIdOrThrow();
    const request = await this.requestsRepository.findOne({
      where: { id, company_id: tenantId },
    });

    if (!request) {
      throw new NotFoundException('Requisição de privacidade não encontrada.');
    }

    if (!actor.isAdmin && request.requester_user_id !== actor.userId) {
      throw new ForbiddenException(
        'Você não pode acessar requisições de outro titular.',
      );
    }

    return request;
  }

  async updateStatus(
    id: string,
    actorUserId: string,
    dto: UpdatePrivacyRequestDto,
  ): Promise<PrivacyRequest> {
    const tenantId = this.getTenantIdOrThrow();
    const request = await this.requestsRepository.findOne({
      where: { id, company_id: tenantId },
    });

    if (!request) {
      throw new NotFoundException('Requisição de privacidade não encontrada.');
    }

    if (
      (dto.status === 'fulfilled' || dto.status === 'rejected') &&
      !dto.response_summary?.trim()
    ) {
      throw new BadRequestException(
        'Resumo de resposta é obrigatório para concluir ou rejeitar requisição LGPD.',
      );
    }

    const previousStatus = request.status;
    const previousResponseSummary = request.response_summary;

    request.status = dto.status;
    request.response_summary =
      dto.response_summary?.trim() || request.response_summary;
    request.handled_by_user_id = actorUserId;

    if (dto.status === 'fulfilled') {
      request.fulfilled_at = new Date();
      request.rejected_at = null;
    } else if (dto.status === 'rejected') {
      request.rejected_at = new Date();
      request.fulfilled_at = null;
    }

    const saved = await this.requestsRepository.save(request);

    if (previousStatus !== saved.status) {
      await this.recordEvent({
        request: saved,
        actorUserId,
        eventType: 'status_changed',
        fromStatus: previousStatus,
        toStatus: saved.status,
        notes: saved.response_summary,
      });
      await this.notifyRequesterBestEffort({
        request: saved,
        previousStatus,
      });
    } else if (previousResponseSummary !== saved.response_summary) {
      await this.recordEvent({
        request: saved,
        actorUserId,
        eventType: 'response_updated',
        fromStatus: saved.status,
        toStatus: saved.status,
        notes: saved.response_summary,
      });
      await this.notifyRequesterBestEffort({
        request: saved,
        previousStatus,
      });
    }

    return saved;
  }
}
