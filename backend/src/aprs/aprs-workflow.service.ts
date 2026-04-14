import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { Apr, AprStatus, APR_ALLOWED_TRANSITIONS } from './entities/apr.entity';
import { AprLog } from './entities/apr-log.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { ForensicTrailService } from '../forensic-trail/forensic-trail.service';
import { FORENSIC_EVENT_TYPES } from '../forensic-trail/forensic-trail.constants';

const APR_LOG_ACTIONS = {
  APPROVED: 'APR_APROVADA',
  REJECTED: 'APR_REPROVADA',
  FINALIZED: 'APR_ENCERRADA',
} as const;

type AprLogAction = (typeof APR_LOG_ACTIONS)[keyof typeof APR_LOG_ACTIONS];

@Injectable()
export class AprWorkflowService {
  private readonly logger = new Logger(AprWorkflowService.name);

  constructor(
    @InjectRepository(Apr)
    private readonly aprsRepository: Repository<Apr>,
    @InjectRepository(AprLog)
    private readonly aprLogsRepository: Repository<AprLog>,
    private readonly tenantService: TenantService,
    private readonly forensicTrailService: ForensicTrailService,
  ) {}

  /**
   * Executa uma transição de status da APR de forma atômica e segura.
   */
  async executeAprWorkflowTransition(
    id: string,
    fn: (apr: Apr, manager: EntityManager) => Promise<Apr>,
  ): Promise<Apr> {
    const tenantId = this.tenantService.getTenantId();

    return this.aprsRepository.manager.transaction(async (manager) => {
      const rows = await manager.query<Apr[]>(
        `SELECT * FROM "aprs" WHERE "id" = $1${tenantId ? ' AND "company_id" = $2' : ''} FOR UPDATE NOWAIT`,
        tenantId ? [id, tenantId] : [id],
      );

      if (!rows || rows.length === 0) {
        throw new NotFoundException(`APR com ID ${id} não encontrada`);
      }

      const apr = manager.getRepository(Apr).create(rows[0]);
      return fn(apr, manager);
    });
  }

  async approve(id: string, userId: string, reason?: string): Promise<Apr> {
    const saved = await this.executeAprWorkflowTransition(
      id,
      async (apr, manager) => {
        await this.assertAprReadyForApproval(apr, manager);
        const currentStatus = this.ensureAprStatus(apr.status);
        const allowed = APR_ALLOWED_TRANSITIONS[currentStatus];
        if (!allowed?.includes(AprStatus.APROVADA)) {
          throw new BadRequestException(
            `Transição inválida: ${currentStatus} → Aprovada. Permitidas: ${allowed?.join(', ') || 'nenhuma'}`,
          );
        }
        apr.status = AprStatus.APROVADA;
        apr.aprovado_por_id = userId;
        apr.aprovado_em = new Date();
        if (reason) apr.aprovado_motivo = reason;
        return manager.getRepository(Apr).save(apr);
      },
    );
    await this.addLog(id, userId, APR_LOG_ACTIONS.APPROVED, {
      ...this.buildAprTraceMetadata(saved),
      motivo: reason,
    });
    this.logger.log({ event: 'apr_approved', aprId: id, userId });
    return saved;
  }

  async reject(id: string, userId: string, reason: string): Promise<Apr> {
    const saved = await this.executeAprWorkflowTransition(
      id,
      async (apr, manager) => {
        this.assertAprWorkflowTransitionAllowed(apr);
        const currentStatus = this.ensureAprStatus(apr.status);
        const allowed = APR_ALLOWED_TRANSITIONS[currentStatus];
        if (!allowed?.includes(AprStatus.CANCELADA)) {
          throw new BadRequestException(
            `Transição inválida: ${currentStatus} → Cancelada. Permitidas: ${allowed?.join(', ') || 'nenhuma'}`,
          );
        }
        const previousStatus = currentStatus;
        apr.status = AprStatus.CANCELADA;
        apr.reprovado_por_id = userId;
        apr.reprovado_em = new Date();
        apr.reprovado_motivo = reason;
        const persisted = await manager.getRepository(Apr).save(apr);
        await this.forensicTrailService.append(
          {
            eventType: FORENSIC_EVENT_TYPES.DOCUMENT_CANCELED,
            module: 'apr',
            entityId: persisted.id,
            companyId: persisted.company_id,
            userId,
            metadata: {
              previousStatus,
              currentStatus: persisted.status,
              reason,
            },
          },
          { manager },
        );
        return persisted;
      },
    );
    await this.addLog(id, userId, APR_LOG_ACTIONS.REJECTED, {
      ...this.buildAprTraceMetadata(saved),
      motivo: reason,
    });
    this.logger.log({ event: 'apr_rejected', aprId: id, userId });
    return saved;
  }

  async finalize(id: string, userId: string): Promise<Apr> {
    const saved = await this.executeAprWorkflowTransition(
      id,
      async (apr, manager) => {
        this.assertAprReadyForFinalization(apr);
        const currentStatus = this.ensureAprStatus(apr.status);
        const allowed = APR_ALLOWED_TRANSITIONS[currentStatus];
        if (!allowed?.includes(AprStatus.ENCERRADA)) {
          throw new BadRequestException(
            `Transição inválida: ${currentStatus} → Encerrada. Permitidas: ${allowed?.join(', ') || 'nenhuma'}`,
          );
        }
        apr.status = AprStatus.ENCERRADA;
        return manager.getRepository(Apr).save(apr);
      },
    );
    await this.addLog(
      id,
      userId,
      APR_LOG_ACTIONS.FINALIZED,
      this.buildAprTraceMetadata(saved),
    );
    this.logger.log({ event: 'apr_finalized', aprId: id, userId });
    return saved;
  }

  async addLog(
    aprId: string,
    userId: string | undefined,
    acao: AprLogAction,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const log = this.aprLogsRepository.create({
        apr_id: aprId,
        usuario_id: userId ?? undefined,
        acao,
        metadata: metadata ?? undefined,
      });
      await this.aprLogsRepository.save(log);
    } catch {
      this.logger.warn(`Falha ao gravar log de APR (${aprId}): ${acao}`);
    }
  }

  buildAprTraceMetadata(apr: Apr): Record<string, unknown> {
    return {
      companyId: apr.company_id,
      status: apr.status,
      versao: apr.versao ?? 1,
      siteId: apr.site_id,
      participantCount: Array.isArray(apr.participants)
        ? apr.participants.length
        : 0,
      riskItemCount: Array.isArray(apr.risk_items)
        ? apr.risk_items.length
        : Array.isArray(apr.itens_risco)
          ? apr.itens_risco.length
          : 0,
    };
  }

  ensureAprStatus(status: unknown): AprStatus {
    if (Object.values(AprStatus).includes(status as AprStatus)) {
      return status as AprStatus;
    }
    return AprStatus.PENDENTE;
  }

  assertAprFormMutable(apr: Apr): void {
    const status = this.ensureAprStatus(apr.status);
    if (status !== AprStatus.PENDENTE) {
      throw new BadRequestException(
        'Somente APRs pendentes podem ser editadas pelo formulário. Use os fluxos formais de aprovação, cancelamento, encerramento ou nova versão.',
      );
    }
  }

  assertAprRemovable(apr: Pick<Apr, 'status' | 'pdf_file_key'>): void {
    if (apr.pdf_file_key) {
      throw new BadRequestException(
        'Somente APRs pendentes e sem PDF final podem ser removidas. Use os fluxos formais de cancelamento/encerramento para registros fechados.',
      );
    }

    const status = this.ensureAprStatus(apr.status);
    if (status !== AprStatus.PENDENTE) {
      throw new BadRequestException(
        'Somente APRs pendentes e sem PDF final podem ser removidas. Use os fluxos formais de cancelamento/encerramento para registros fechados.',
      );
    }
  }

  async assertAprReadyForApproval(
    apr: Apr,
    manager: EntityManager,
  ): Promise<void> {
    const status = this.ensureAprStatus(apr.status);
    if (status !== AprStatus.PENDENTE) {
      throw new BadRequestException(
        `Esta APR não está pronta para aprovação (status: ${status}).`,
      );
    }

    const participantRows = await manager.query<Array<{ count: string }>>(
      'SELECT COUNT(*)::text AS count FROM "apr_participants" WHERE "apr_id" = $1',
      [apr.id],
    );
    const participantCount = Number(participantRows[0]?.count ?? 0);

    if (participantCount === 0) {
      throw new BadRequestException(
        'A APR deve ter pelo menos um participante.',
      );
    }

    const riskItemRows = await manager.query<Array<{ count: string }>>(
      'SELECT COUNT(*)::text AS count FROM "apr_risk_items" WHERE "apr_id" = $1',
      [apr.id],
    );
    const persistedRiskItemCount = Number(riskItemRows[0]?.count ?? 0);
    const legacyRiskItemCount = Array.isArray(apr.itens_risco)
      ? apr.itens_risco.length
      : 0;

    if (persistedRiskItemCount === 0 && legacyRiskItemCount === 0) {
      throw new BadRequestException(
        'A APR deve ter pelo menos um item de risco.',
      );
    }
  }

  assertAprReadyForFinalization(
    apr: Pick<Apr, 'status' | 'pdf_file_key'>,
  ): void {
    this.assertAprWorkflowTransitionAllowed(apr);

    const status = this.ensureAprStatus(apr.status);
    if (status !== AprStatus.APROVADA) {
      throw new BadRequestException(
        `Esta APR não está pronta para ser encerrada (status: ${status}).`,
      );
    }
  }

  assertAprWorkflowTransitionAllowed(
    apr: Pick<Apr, 'status' | 'pdf_file_key'>,
  ): void {
    if (apr.pdf_file_key) {
      throw new BadRequestException(
        'APR com PDF final emitido está bloqueada para mudança de status. Gere uma nova versão para seguir com alterações.',
      );
    }

    const status = this.ensureAprStatus(apr.status);
    if (status === AprStatus.ENCERRADA || status === AprStatus.CANCELADA) {
      throw new BadRequestException(
        `Não é possível alterar o fluxo de uma APR já ${status}.`,
      );
    }
  }
}
