import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { plainToClass } from 'class-transformer';
import { Inspection } from './entities/inspection.entity';
import { InspectionResponseDto } from './dto/inspection-response.dto';
import {
  CreateInspectionDto,
  UpdateInspectionDto,
} from './dto/create-inspection.dto';

import { NotificationsGateway } from '../notifications/notifications.gateway';
import { TenantService } from '../common/tenant/tenant.service';
import { Site } from '../sites/entities/site.entity';
import { User } from '../users/entities/user.entity';
import {
  TenantRepository,
  TenantRepositoryFactory,
} from '../common/tenant/tenant-repository';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import { S3Service } from '../common/storage/s3.service';

@Injectable()
export class InspectionsService {
  private readonly logger = new Logger(InspectionsService.name);
  private readonly tenantRepo: TenantRepository<Inspection>;

  constructor(
    @InjectRepository(Inspection)
    private inspectionsRepository: Repository<Inspection>,
    @InjectRepository(Site)
    private sitesRepository: Repository<Site>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private notificationsGateway: NotificationsGateway,
    private tenantService: TenantService,
    tenantRepositoryFactory: TenantRepositoryFactory,
    private readonly s3Service: S3Service,
  ) {
    this.tenantRepo = tenantRepositoryFactory.wrap(this.inspectionsRepository);
  }

  private normalizeText(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeRequiredText(value: string): string {
    return value.trim();
  }

  private normalizeStringArray(values?: string[]): string[] {
    return Array.from(
      new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
    );
  }

  private normalizePerigosRiscos(
    values?: CreateInspectionDto['perigos_riscos'],
  ): Inspection['perigos_riscos'] {
    return (values ?? [])
      .map((item) => ({
        grupo_risco: this.normalizeRequiredText(item.grupo_risco),
        perigo_fator_risco: this.normalizeRequiredText(item.perigo_fator_risco),
        fonte_circunstancia: this.normalizeRequiredText(
          item.fonte_circunstancia,
        ),
        trabalhadores_expostos: this.normalizeRequiredText(
          item.trabalhadores_expostos,
        ),
        tipo_exposicao: this.normalizeRequiredText(item.tipo_exposicao),
        medidas_existentes: this.normalizeRequiredText(item.medidas_existentes),
        severidade: this.normalizeRequiredText(item.severidade),
        probabilidade: this.normalizeRequiredText(item.probabilidade),
        nivel_risco: this.normalizeRequiredText(item.nivel_risco),
        classificacao_risco: this.normalizeRequiredText(
          item.classificacao_risco,
        ),
        acoes_necessarias: this.normalizeRequiredText(item.acoes_necessarias),
        prazo: this.normalizeRequiredText(item.prazo),
        responsavel: this.normalizeRequiredText(item.responsavel),
      }))
      .filter(
        (item) =>
          item.grupo_risco ||
          item.perigo_fator_risco ||
          item.acoes_necessarias ||
          item.responsavel,
      );
  }

  private normalizePlanoAcao(
    values?: CreateInspectionDto['plano_acao'],
  ): Inspection['plano_acao'] {
    return (values ?? [])
      .map((item) => ({
        acao: this.normalizeRequiredText(item.acao),
        responsavel: this.normalizeRequiredText(item.responsavel),
        prazo: this.normalizeRequiredText(item.prazo),
        status: this.normalizeText(item.status) || 'Pendente',
      }))
      .filter((item) => item.acao || item.responsavel || item.prazo);
  }

  private normalizeEvidencias(
    values?: CreateInspectionDto['evidencias'],
  ): Inspection['evidencias'] {
    return (values ?? [])
      .map((item) => ({
        descricao: this.normalizeRequiredText(item.descricao),
        url: this.normalizeText(item.url) || undefined,
        original_name: this.normalizeText((item as any).original_name) || undefined,
      }))
      .filter((item) => item.descricao || item.url);
  }

  private async signEvidenceUrls(
    evidencias: Inspection['evidencias'],
  ): Promise<
    | {
        descricao: string;
        url?: string;
        original_name?: string;
      }[]
    | null
  > {
    if (!evidencias || evidencias.length === 0) return evidencias ?? null;
    const mapped = await Promise.all(
      evidencias.map(async (ev) => {
        if (!ev.url) return ev;
        const isHttp = ev.url.startsWith('http://') || ev.url.startsWith('https://');
        let signed = ev.url;
        if (!isHttp) {
          try {
            signed = await this.s3Service.getSignedUrl(ev.url, 3600);
          } catch (err) {
            this.logger.warn(
              `Não foi possível assinar URL da evidência (${ev.url}): ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }
        return { ...ev, url: signed };
      }),
    );
    return mapped;
  }

  private buildCreatePayload(
    dto: CreateInspectionDto,
    companyId: string,
  ): Partial<Inspection> {
    return {
      company_id: companyId,
      site_id: dto.site_id,
      setor_area: this.normalizeRequiredText(dto.setor_area),
      tipo_inspecao: this.normalizeRequiredText(dto.tipo_inspecao),
      data_inspecao: dto.data_inspecao as unknown as Date,
      horario: this.normalizeRequiredText(dto.horario),
      responsavel_id: dto.responsavel_id,
      objetivo: this.normalizeText(dto.objetivo),
      descricao_local_atividades: this.normalizeText(
        dto.descricao_local_atividades,
      ),
      metodologia: this.normalizeStringArray(dto.metodologia),
      perigos_riscos: this.normalizePerigosRiscos(dto.perigos_riscos),
      plano_acao: this.normalizePlanoAcao(dto.plano_acao),
      evidencias: this.normalizeEvidencias(dto.evidencias),
      conclusao: this.normalizeText(dto.conclusao),
    };
  }

  private buildUpdatePayload(dto: UpdateInspectionDto): Partial<Inspection> {
    const payload: Partial<Inspection> = {};

    if (dto.site_id !== undefined) payload.site_id = dto.site_id;
    if (dto.setor_area !== undefined) {
      payload.setor_area = this.normalizeRequiredText(dto.setor_area);
    }
    if (dto.tipo_inspecao !== undefined) {
      payload.tipo_inspecao = this.normalizeRequiredText(dto.tipo_inspecao);
    }
    if (dto.data_inspecao !== undefined) {
      payload.data_inspecao = dto.data_inspecao as unknown as Date;
    }
    if (dto.horario !== undefined) {
      payload.horario = this.normalizeRequiredText(dto.horario);
    }
    if (dto.responsavel_id !== undefined)
      payload.responsavel_id = dto.responsavel_id;
    if (dto.objetivo !== undefined)
      payload.objetivo = this.normalizeText(dto.objetivo);
    if (dto.descricao_local_atividades !== undefined) {
      payload.descricao_local_atividades = this.normalizeText(
        dto.descricao_local_atividades,
      );
    }
    if (dto.metodologia !== undefined) {
      payload.metodologia = this.normalizeStringArray(dto.metodologia);
    }
    if (dto.perigos_riscos !== undefined) {
      payload.perigos_riscos = this.normalizePerigosRiscos(dto.perigos_riscos);
    }
    if (dto.plano_acao !== undefined) {
      payload.plano_acao = this.normalizePlanoAcao(dto.plano_acao);
    }
    if (dto.evidencias !== undefined) {
      payload.evidencias = this.normalizeEvidencias(dto.evidencias);
    }
    if (dto.conclusao !== undefined)
      payload.conclusao = this.normalizeText(dto.conclusao);

    return payload;
  }

  private async validateLinkedRecords(
    payload: Partial<Inspection>,
    companyId: string,
  ): Promise<void> {
    if (payload.site_id) {
      const site = await this.sitesRepository.findOne({
        where: { id: payload.site_id, company_id: companyId, status: true },
      });
      if (!site) {
        throw new BadRequestException(
          'O site informado não pertence à empresa selecionada.',
        );
      }
    }

    if (payload.responsavel_id) {
      const responsavel = await this.usersRepository.findOne({
        where: {
          id: payload.responsavel_id,
          company_id: companyId,
          status: true,
          deletedAt: IsNull(),
        },
      });
      if (!responsavel) {
        throw new BadRequestException(
          'O responsável informado não está ativo ou não pertence à empresa selecionada.',
        );
      }
    }
  }

  async create(
    createInspectionDto: CreateInspectionDto,
    companyId: string,
  ): Promise<InspectionResponseDto> {
    const payload = this.buildCreatePayload(createInspectionDto, companyId);
    await this.validateLinkedRecords(payload, companyId);

    const inspection = this.inspectionsRepository.create(payload);
    const saved = await this.inspectionsRepository.save(inspection);

    // Notificar em tempo real
    try {
      // Notificar usuário (ex: admin ou quem criou se fosse passado)
      // Como não temos userId aqui, vamos notificar a empresa
      this.notificationsGateway.sendToCompany(companyId, 'inspection:created', {
        id: saved.id,
        message: 'Nova inspeção foi criada',
      });

      // Exemplo de notificar usuário específico se tivéssemos o ID
      // const currentUserId = this.tenantService.getTenantId(); // tenantId costuma ser companyId, mas se fosse userId...
      // assumindo que podemos pegar o usuário atual via request context se injetado, mas aqui vamos manter simples
    } catch (error) {
      this.logger.error('Falha ao enviar notificação de inspeção', error);
    }

    return plainToClass(InspectionResponseDto, saved);
  }

  async findAll(companyId: string): Promise<InspectionResponseDto[]> {
    const inspections = await this.inspectionsRepository.find({
      where: { company_id: companyId },
      relations: ['site', 'responsavel'],
      order: { created_at: 'DESC' },
    });
    return inspections.map((i) => plainToClass(InspectionResponseDto, i));
  }

  async findPaginated(
    companyId: string,
    opts?: {
      page?: number;
      limit?: number;
      search?: string;
    },
  ): Promise<OffsetPage<InspectionResponseDto>> {
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const query = this.inspectionsRepository
      .createQueryBuilder('inspection')
      .leftJoinAndSelect('inspection.site', 'site')
      .leftJoinAndSelect('inspection.responsavel', 'responsavel')
      .where('inspection.company_id = :companyId', { companyId })
      .orderBy('inspection.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (opts?.search?.trim()) {
      const search = `%${opts.search.trim().toLowerCase()}%`;
      query.andWhere(
        `(
          LOWER(inspection.setor_area) LIKE :search
          OR LOWER(inspection.tipo_inspecao) LIKE :search
          OR LOWER(COALESCE(site.nome, '')) LIKE :search
          OR LOWER(COALESCE(responsavel.nome, '')) LIKE :search
        )`,
        { search },
      );
    }

    const [data, total] = await query.getManyAndCount();
    return toOffsetPage(
      data.map((item) => plainToClass(InspectionResponseDto, item)),
      total,
      page,
      limit,
    );
  }

  async countPendingActionItems(companyId?: string): Promise<number> {
    const resolvedCompanyId = companyId || this.tenantService.getTenantId();
    const params = resolvedCompanyId ? [resolvedCompanyId] : [];
    const where = resolvedCompanyId ? 'WHERE i.company_id = $1' : '';

    const rows: unknown = await this.inspectionsRepository.query(
      `
        SELECT COALESCE(
          SUM(
            (
              SELECT COUNT(*)
              FROM json_array_elements(COALESCE(i.plano_acao, '[]'::json)) AS item
              WHERE LOWER(COALESCE(item->>'status', '')) NOT LIKE '%conclu%'
                AND LOWER(COALESCE(item->>'status', '')) NOT LIKE '%encerr%'
            )
          ),
          0
        )::int AS total
        FROM inspections i
        ${where}
      `,
      params,
    );

    const firstRow =
      Array.isArray(rows) && rows[0] && typeof rows[0] === 'object'
        ? (rows[0] as Record<string, unknown>)
        : undefined;
    const total = firstRow?.total;

    return Number(
      typeof total === 'number' || typeof total === 'string' ? total : 0,
    );
  }

  async findOne(id: string, companyId: string): Promise<InspectionResponseDto> {
    const inspection = await this.findOneEntity(id, companyId);
    const evidencias = await this.signEvidenceUrls(inspection.evidencias);
    return plainToClass(InspectionResponseDto, { ...inspection, evidencias });
  }

  private buildValidationCode(inspection: Inspection): string {
    const prefix = 'INS';
    const year = new Date().getFullYear();
    const ref = (inspection.id || inspection.tipo_inspecao || 'INS')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-8)
      .toUpperCase();
    return `${prefix}-${year}-${ref}`;
  }

  async validateByCode(code: string) {
    const normalized = code.trim().toUpperCase();
    const suffix = normalized.split('-').pop();
    if (!suffix) {
      throw new BadRequestException('Código inválido.');
    }

    const query = this.inspectionsRepository
      .createQueryBuilder('inspection')
      .where("REPLACE(inspection.id, '-', '') ILIKE :suffix", {
        suffix: `%${suffix}%`,
      })
      .orderBy('inspection.created_at', 'DESC')
      .limit(5);

    const matches = await query.getMany();
    const match = matches.find(
      (item) => this.buildValidationCode(item) === normalized,
    );

    if (!match) {
      return { valid: false, message: 'Documento não encontrado.' };
    }

    return {
      valid: true,
      code: normalized,
      inspection: {
        id: match.id,
        site_id: match.site_id,
        setor_area: match.setor_area,
        tipo_inspecao: match.tipo_inspecao,
        data_inspecao: match.data_inspecao,
        responsavel_id: match.responsavel_id,
        updated_at: match.updated_at,
      },
    };
  }

  private guessContentType(filename?: string): string {
    if (!filename) return 'application/octet-stream';
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      case 'heic':
        return 'image/heic';
      case 'pdf':
        return 'application/pdf';
      default:
        return 'application/octet-stream';
    }
  }

  async downloadEvidenceFile(
    id: string,
    index: number,
    companyId: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const inspection = await this.findOneEntity(id, companyId);
    const evidencias = inspection.evidencias || [];
    const evidence = evidencias[index];
    if (!evidence || !evidence.url) {
      throw new NotFoundException('Evidência não encontrada.');
    }

    const key = evidence.url;
    const filename =
      evidence.original_name ||
      key.split('/').pop() ||
      `evidencia-${index + 1}.bin`;

    const buffer = await this.s3Service.downloadFile(key);
    const contentType = this.guessContentType(filename);
    return { buffer, contentType, filename };
  }

  async findOneEntity(id: string, companyId: string): Promise<Inspection> {
    const inspection = await this.tenantRepo.findOne(id, companyId, {
      relations: ['site', 'responsavel', 'company'],
    });

    if (!inspection) {
      throw new NotFoundException(`Inspection with ID ${id} not found`);
    }

    return inspection;
  }

  async update(
    id: string,
    updateInspectionDto: UpdateInspectionDto,
    companyId: string,
  ): Promise<InspectionResponseDto> {
    const inspection = await this.findOneEntity(id, companyId);
    const payload = this.buildUpdatePayload(updateInspectionDto);
    await this.validateLinkedRecords(payload, companyId);
    Object.assign(inspection, payload);
    const saved = await this.inspectionsRepository.save(inspection);
    return plainToClass(InspectionResponseDto, saved);
  }

  async remove(id: string, companyId: string): Promise<void> {
    const inspection = await this.findOneEntity(id, companyId);
    await this.inspectionsRepository.remove(inspection);
  }

  async attachEvidence(
    id: string,
    file: Express.Multer.File,
    descricao: string | undefined,
    companyId: string,
  ) {
    if (!file) throw new BadRequestException('Arquivo não enviado.');
    const inspection = await this.findOneEntity(id, companyId);

    const key = this.s3Service.generateDocumentKey(
      inspection.company_id,
      'inspections',
      id,
      file.originalname,
    );

    try {
      await this.s3Service.uploadFile(key, file.buffer, file.mimetype);
    } catch (err) {
      this.logger.error(
        `Falha ao enviar evidência para armazenamento: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new BadRequestException('Não foi possível armazenar o arquivo da evidência.');
    }

    const entry = {
      descricao: this.normalizeRequiredText(
        descricao || file.originalname || 'Evidência sem descrição',
      ),
      url: key,
      original_name: file.originalname,
    };

    const evidencias = [...(inspection.evidencias || []), entry];
    await this.inspectionsRepository.update(id, { evidencias });

    return { evidencias };
  }
}
