import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { SignatureTimestampService } from '../common/services/signature-timestamp.service';
import { TenantService } from '../common/tenant/tenant.service';
import {
  normalizeOffsetPagination,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import { Epi } from '../epis/entities/epi.entity';
import { User } from '../users/entities/user.entity';
import {
  CreateEpiAssignmentDto,
  EpiSignatureInputDto,
} from './dto/create-epi-assignment.dto';
import {
  ReplaceEpiAssignmentDto,
  ReturnEpiAssignmentDto,
} from './dto/return-epi-assignment.dto';
import { UpdateEpiAssignmentDto } from './dto/update-epi-assignment.dto';
import {
  EpiAssignment,
  EpiSignatureStamp,
} from './entities/epi-assignment.entity';

@Injectable()
export class EpiAssignmentsService {
  constructor(
    @InjectRepository(EpiAssignment)
    private readonly assignmentsRepository: Repository<EpiAssignment>,
    @InjectRepository(Epi)
    private readonly episRepository: Repository<Epi>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly tenantService: TenantService,
    private readonly signatureTimestampService: SignatureTimestampService,
    private readonly auditService: AuditService,
  ) {}

  async create(
    dto: CreateEpiAssignmentDto,
    actorId?: string,
  ): Promise<EpiAssignment> {
    const companyId = this.getTenantIdOrThrow();
    const [epi, user] = await Promise.all([
      this.episRepository.findOne({
        where: { id: dto.epi_id, company_id: companyId },
      }),
      this.usersRepository.findOne({
        where: { id: dto.user_id, company_id: companyId },
      }),
    ]);

    if (!epi) {
      throw new NotFoundException('EPI não encontrado para esta empresa.');
    }
    if (!user) {
      throw new NotFoundException(
        'Colaborador não encontrado para esta empresa.',
      );
    }

    const assinaturaEntrega = this.buildSignatureStamp(
      dto.assinatura_entrega,
      user.id,
    );

    const assignment = this.assignmentsRepository.create({
      company_id: companyId,
      epi_id: dto.epi_id,
      user_id: dto.user_id,
      site_id: dto.site_id,
      ca: epi.ca,
      validade_ca: epi.validade_ca,
      quantidade: dto.quantidade || 1,
      status: 'entregue',
      entregue_em: new Date(),
      observacoes: dto.observacoes,
      assinatura_entrega: assinaturaEntrega,
      created_by_id: actorId,
      updated_by_id: actorId,
    });

    const saved = await this.assignmentsRepository.save(assignment);
    await this.writeAuditLog(AuditAction.CREATE, saved, actorId, {
      event: 'epi_assignment_delivered',
      companyId,
      epiId: saved.epi_id,
      userId: saved.user_id,
    });
    return saved;
  }

  async findAll(filters?: {
    status?: 'entregue' | 'devolvido' | 'substituido';
    user_id?: string;
    epi_id?: string;
  }): Promise<EpiAssignment[]> {
    const page = await this.findPaginated({
      ...filters,
      page: 1,
      limit: 100,
    });
    return page.data;
  }

  async findPaginated(filters?: {
    status?: 'entregue' | 'devolvido' | 'substituido';
    user_id?: string;
    epi_id?: string;
    page?: number;
    limit?: number;
  }) {
    const companyId = this.getTenantIdOrThrow();
    const { page, limit, skip } = normalizeOffsetPagination(filters, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const query = this.assignmentsRepository
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.epi', 'epi')
      .leftJoinAndSelect('assignment.user', 'user')
      .leftJoinAndSelect('assignment.site', 'site')
      .where('assignment.company_id = :companyId', { companyId })
      .orderBy('assignment.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (filters?.status) {
      query.andWhere('assignment.status = :status', { status: filters.status });
    }

    if (filters?.user_id) {
      query.andWhere('assignment.user_id = :userId', {
        userId: filters.user_id,
      });
    }

    if (filters?.epi_id) {
      query.andWhere('assignment.epi_id = :epiId', { epiId: filters.epi_id });
    }

    const [data, total] = await query.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  async findOne(id: string): Promise<EpiAssignment> {
    const companyId = this.getTenantIdOrThrow();
    const assignment = await this.assignmentsRepository.findOne({
      where: { id, company_id: companyId },
      relations: ['epi', 'user', 'site'],
    });
    if (!assignment) {
      throw new NotFoundException(`Ficha EPI com ID ${id} não encontrada.`);
    }
    return assignment;
  }

  async update(
    id: string,
    dto: UpdateEpiAssignmentDto,
    actorId?: string,
  ): Promise<EpiAssignment> {
    const assignment = await this.findOne(id);
    if (assignment.status === 'devolvido') {
      throw new BadRequestException(
        'Ficha já devolvida. Não é possível edição genérica.',
      );
    }

    Object.assign(assignment, {
      ...dto,
      updated_by_id: actorId,
    });

    const saved = await this.assignmentsRepository.save(assignment);
    await this.writeAuditLog(AuditAction.UPDATE, saved, actorId, {
      event: 'epi_assignment_updated',
      companyId: saved.company_id,
      fields: Object.keys(dto),
    });
    return saved;
  }

  async returnAssignment(
    id: string,
    dto: ReturnEpiAssignmentDto,
    actorId?: string,
  ): Promise<EpiAssignment> {
    const assignment = await this.findOne(id);
    if (assignment.status !== 'entregue') {
      throw new BadRequestException(
        `Somente fichas entregues podem ser devolvidas. Status atual: ${assignment.status}.`,
      );
    }

    const assinaturaDevolucao = this.buildSignatureStamp(
      dto.assinatura_devolucao,
      assignment.user_id,
    );

    assignment.status = 'devolvido';
    assignment.devolvido_em = new Date();
    assignment.motivo_devolucao = dto.motivo_devolucao;
    assignment.observacoes = dto.observacoes || assignment.observacoes;
    assignment.assinatura_devolucao = assinaturaDevolucao;
    assignment.updated_by_id = actorId;

    const saved = await this.assignmentsRepository.save(assignment);
    await this.writeAuditLog(AuditAction.UPDATE, saved, actorId, {
      event: 'epi_assignment_returned',
      companyId: saved.company_id,
      userId: saved.user_id,
    });
    return saved;
  }

  async replaceAssignment(
    id: string,
    dto: ReplaceEpiAssignmentDto,
    actorId?: string,
  ): Promise<EpiAssignment> {
    const assignment = await this.findOne(id);
    if (assignment.status !== 'entregue') {
      throw new BadRequestException(
        'Somente fichas em uso podem ser marcadas como substituídas.',
      );
    }

    assignment.status = 'substituido';
    assignment.observacoes =
      `${assignment.observacoes || ''}\nSubstituição: ${dto.motivo_substituicao}`.trim();
    if (dto.observacoes) {
      assignment.observacoes =
        `${assignment.observacoes}\n${dto.observacoes}`.trim();
    }
    assignment.updated_by_id = actorId;

    const saved = await this.assignmentsRepository.save(assignment);
    await this.writeAuditLog(AuditAction.UPDATE, saved, actorId, {
      event: 'epi_assignment_replaced',
      companyId: saved.company_id,
      userId: saved.user_id,
      reason: dto.motivo_substituicao,
    });
    return saved;
  }

  async getSummary() {
    const companyId = this.getTenantIdOrThrow();
    const now = new Date();
    const [total, entregue, devolvido, substituido] = await Promise.all([
      this.assignmentsRepository.count({ where: { company_id: companyId } }),
      this.assignmentsRepository.count({
        where: { company_id: companyId, status: 'entregue' },
      }),
      this.assignmentsRepository.count({
        where: { company_id: companyId, status: 'devolvido' },
      }),
      this.assignmentsRepository.count({
        where: { company_id: companyId, status: 'substituido' },
      }),
    ]);

    const caExpirado = await this.assignmentsRepository
      .createQueryBuilder('assignment')
      .where('assignment.company_id = :companyId', { companyId })
      .andWhere("assignment.status = 'entregue'")
      .andWhere('assignment.validade_ca IS NOT NULL')
      .andWhere('assignment.validade_ca < :now', { now })
      .getCount();

    return {
      total,
      entregue,
      devolvido,
      substituido,
      caExpirado,
    };
  }

  private buildSignatureStamp(
    input: EpiSignatureInputDto,
    signerUserId?: string,
  ): EpiSignatureStamp {
    const generated = this.signatureTimestampService.issueFromRaw(
      input.signature_data,
    );
    return {
      signer_user_id: signerUserId,
      signer_name: input.signer_name,
      signature_data: input.signature_data,
      signature_type: input.signature_type,
      signature_hash: generated.signature_hash,
      timestamp_token: generated.timestamp_token,
      timestamp_issued_at: generated.timestamp_issued_at,
      timestamp_authority: generated.timestamp_authority,
    };
  }

  private getTenantIdOrThrow(): string {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Contexto de empresa não definido.');
    }
    return tenantId;
  }

  private async writeAuditLog(
    action: AuditAction,
    assignment: EpiAssignment,
    actorId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.auditService.log({
      action,
      entity: 'EPI_ASSIGNMENT',
      entityId: assignment.id,
      userId: actorId || '',
      companyId: assignment.company_id,
      changes: metadata,
      ip: 'unknown', // No contexto do serviço não temos IP facilmente
      userAgent: 'system',
    });
  }
}
