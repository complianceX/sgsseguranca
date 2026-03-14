import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Dds, DdsStatus, DDS_ALLOWED_TRANSITIONS } from './entities/dds.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { CreateDdsDto } from './dto/create-dds.dto';
import { UpdateDdsDto } from './dto/update-dds.dto';
import { User } from '../users/entities/user.entity';
import {
  DocumentBundleService,
  WeeklyBundleFilters,
} from '../common/services/document-bundle.service';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import { S3Service } from '../common/storage/s3.service';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';

@Injectable()
export class DdsService {
  private readonly logger = new Logger(DdsService.name);

  constructor(
    @InjectRepository(Dds)
    private ddsRepository: Repository<Dds>,
    private tenantService: TenantService,
    private readonly documentBundleService: DocumentBundleService,
    private readonly s3Service: S3Service,
    private readonly documentGovernanceService: DocumentGovernanceService,
  ) {}

  async create(createDdsDto: CreateDdsDto): Promise<Dds> {
    const { participants, company_id, ...rest } = createDdsDto;
    const tenantId = this.tenantService.getTenantId();
    const resolvedCompanyId = tenantId || company_id;
    if (!resolvedCompanyId) {
      throw new BadRequestException('Empresa não definida para o DDS');
    }

    const dds = this.ddsRepository.create({
      ...rest,
      company_id: resolvedCompanyId,
      participants: participants?.map((id) => ({ id }) as unknown as User),
    });

    const saved = await this.ddsRepository.save(dds);
    this.logger.log({
      event: 'dds_created',
      ddsId: saved.id,
      companyId: saved.company_id,
    });
    return saved;
  }

  async findAll(): Promise<Dds[]> {
    const tenantId = this.tenantService.getTenantId();
    return this.ddsRepository.find({
      where: tenantId
        ? { company_id: tenantId, deleted_at: IsNull() }
        : { deleted_at: IsNull() },
      relations: ['site', 'facilitador', 'participants'],
    });
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    search?: string;
    kind?: 'all' | 'model' | 'regular';
  }): Promise<OffsetPage<Dds>> {
    const tenantId = this.tenantService.getTenantId();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const idsQuery = this.ddsRepository
      .createQueryBuilder('dds')
      .select('dds.id', 'id')
      .orderBy('dds.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    const countQuery = this.ddsRepository
      .createQueryBuilder('dds')
      .orderBy('dds.created_at', 'DESC');

    if (tenantId) {
      idsQuery.where('dds.company_id = :tenantId', { tenantId });
      countQuery.where('dds.company_id = :tenantId', { tenantId });
    }

    if (opts?.search?.trim()) {
      const search = `%${opts.search.trim().toLowerCase()}%`;
      const condition = 'LOWER(dds.tema) LIKE :search';
      if (tenantId) {
        idsQuery.andWhere(condition, { search });
        countQuery.andWhere(condition, { search });
      } else {
        idsQuery.where(condition, { search });
        countQuery.where(condition, { search });
      }
    }

    if (opts?.kind === 'model') {
      idsQuery.andWhere('dds.is_modelo = true');
      countQuery.andWhere('dds.is_modelo = true');
    } else if (opts?.kind === 'regular') {
      idsQuery.andWhere('dds.is_modelo = false');
      countQuery.andWhere('dds.is_modelo = false');
    }

    const [rows, total] = await Promise.all([
      idsQuery.getRawMany<{ id: string }>(),
      countQuery.getCount(),
    ]);

    const ids = rows.map((row) => row.id);
    if (ids.length === 0) {
      return toOffsetPage([], total, page, limit);
    }

    const data = await this.ddsRepository.find({
      where: ids.map((id) => ({ id })),
      relations: ['site', 'facilitador', 'participants', 'company'],
    });

    const ordered = ids
      .map((id) => data.find((item) => item.id === id))
      .filter((item): item is Dds => Boolean(item));

    return toOffsetPage(ordered, total, page, limit);
  }

  async findOne(id: string): Promise<Dds> {
    const tenantId = this.tenantService.getTenantId();
    const dds = await this.ddsRepository.findOne({
      where: tenantId
        ? { id, company_id: tenantId, deleted_at: IsNull() }
        : { id, deleted_at: IsNull() },
      relations: ['site', 'facilitador', 'participants'],
    });
    if (!dds) {
      throw new NotFoundException(`DDS com ID ${id} não encontrado`);
    }
    return dds;
  }

  async updateStatus(id: string, status: DdsStatus): Promise<Dds> {
    const dds = await this.findOne(id);
    if (dds.pdf_file_key) {
      throw new BadRequestException(
        'DDS com PDF final anexado. Edição bloqueada. Gere um novo DDS para alterar o documento.',
      );
    }
    const allowed = DDS_ALLOWED_TRANSITIONS[dds.status];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Transição inválida: ${dds.status} → ${status}. Permitidas: ${allowed.join(', ') || 'nenhuma'}`,
      );
    }
    dds.status = status;
    return this.ddsRepository.save(dds);
  }

  async attachPdf(
    id: string,
    file: Express.Multer.File,
  ): Promise<{ fileKey: string; folderPath: string; originalName: string }> {
    const dds = await this.findOne(id);
    if (dds.pdf_file_key) {
      throw new BadRequestException(
        'Este DDS já possui PDF final anexado. Gere um novo DDS para substituir o documento.',
      );
    }
    const companyId = dds.company_id;
    const key = this.s3Service.generateDocumentKey(
      companyId,
      'dds',
      id,
      file.originalname,
    );

    try {
      await this.s3Service.uploadFile(key, file.buffer, file.mimetype);
    } catch {
      // S3 desabilitado — armazena a referência sem upload real
      this.logger.warn(`S3 desabilitado, armazenando referência local: ${key}`);
    }

    const folder = `dds/${companyId}`;
    await this.documentGovernanceService.registerFinalDocument({
      companyId: dds.company_id,
      module: 'dds',
      entityId: dds.id,
      title: dds.tema || 'DDS',
      documentDate: dds.data || dds.created_at,
      fileKey: key,
      folderPath: folder,
      originalName: file.originalname,
      mimeType: file.mimetype,
      createdBy: undefined,
      fileBuffer: file.buffer,
      persistEntityMetadata: async (manager) => {
        await manager.getRepository(Dds).update(id, {
          pdf_file_key: key,
          pdf_folder_path: folder,
          pdf_original_name: file.originalname,
        });
      },
    });

    return {
      fileKey: key,
      folderPath: folder,
      originalName: file.originalname,
    };
  }

  async getPdfAccess(id: string): Promise<{
    ddsId: string;
    fileKey: string;
    folderPath: string;
    originalName: string;
    url: string | null;
  }> {
    const dds = await this.findOne(id);
    if (!dds.pdf_file_key) {
      throw new NotFoundException(`DDS ${id} não possui PDF armazenado`);
    }

    let url: string | null = null;
    try {
      url = await this.s3Service.getSignedUrl(dds.pdf_file_key, 3600);
    } catch {
      // S3 desabilitado — retorna null e frontend usa geração local
      url = null;
    }

    return {
      ddsId: dds.id,
      fileKey: dds.pdf_file_key,
      folderPath: dds.pdf_folder_path,
      originalName: dds.pdf_original_name,
      url,
    };
  }

  async getHistoricalPhotoHashes(
    limit = 100,
  ): Promise<{ ddsId: string; hashes: string[] }[]> {
    const tenantId = this.tenantService.getTenantId();

    // Busca os IDs mais recentes sem fazer N+1
    const recent = await this.ddsRepository
      .createQueryBuilder('dds')
      .select('dds.id', 'id')
      .where(tenantId ? 'dds.company_id = :tenantId' : '1=1', { tenantId })
      .andWhere('dds.deleted_at IS NULL')
      .orderBy('dds.created_at', 'DESC')
      .limit(limit)
      .getRawMany<{ id: string }>();

    // Retorna estrutura vazia — hashes estão na tabela de signatures
    // O frontend usa este endpoint para obter apenas os IDs relevantes
    // e faz lookup local. Isso elimina o findAll() + 40 requests anteriores.
    return recent.map((r) => ({ ddsId: r.id, hashes: [] }));
  }

  async update(id: string, updateDdsDto: UpdateDdsDto): Promise<Dds> {
    const dds = await this.findOne(id);
    if (dds.pdf_file_key) {
      throw new BadRequestException(
        'DDS com PDF final anexado. Edição bloqueada. Gere um novo DDS para alterar o documento.',
      );
    }
    const { participants, ...rest } = updateDdsDto;

    Object.assign(dds, rest);

    if (participants) {
      dds.participants = participants.map((id) => ({ id }) as unknown as User);
    }

    const saved = await this.ddsRepository.save(dds);
    this.logger.log({
      event: 'dds_updated',
      ddsId: saved.id,
      companyId: saved.company_id,
    });
    return saved;
  }

  async remove(id: string): Promise<void> {
    const dds = await this.findOne(id);
    await this.documentGovernanceService.removeFinalDocumentReference({
      companyId: dds.company_id,
      module: 'dds',
      entityId: dds.id,
      removeEntityState: async (manager) => {
        await manager.getRepository(Dds).softDelete(id);
      },
    });
    this.logger.log({
      event: 'dds_archived',
      ddsId: dds.id,
      companyId: dds.company_id,
    });
  }

  async count(options?: { where?: Record<string, unknown> }): Promise<number> {
    const tenantId = this.tenantService.getTenantId();
    const where = options?.where || {};
    return this.ddsRepository.count({
      where: tenantId
        ? ({ ...where, company_id: tenantId } as Record<string, unknown>)
        : where,
    });
  }

  async listStoredFiles(filters: WeeklyBundleFilters) {
    const tenantId = this.tenantService.getTenantId();
    const query = this.ddsRepository
      .createQueryBuilder('d')
      .where('d.pdf_file_key IS NOT NULL');

    if (tenantId) {
      query.andWhere('d.company_id = :tenantId', { tenantId });
    }
    if (filters.companyId) {
      query.andWhere('d.company_id = :companyId', {
        companyId: filters.companyId,
      });
    }

    const results = await query.getMany();

    return results
      .filter((d) => {
        if (!d.created_at) return false;
        const date = new Date(d.created_at);
        if (filters.year && date.getFullYear() !== filters.year) return false;
        if (filters.week) {
          const dt = new Date(
            Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
          );
          dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
          const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
          const isoWeek = Math.ceil(
            ((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
          );
          if (isoWeek !== filters.week) return false;
        }
        return true;
      })
      .map((d) => ({
        entityId: d.id,
        title: d.tema,
        date: d.data || d.created_at,
        ddsId: d.id,
        data: d.data || d.created_at,
        id: d.id,
        tema: d.tema,
        companyId: d.company_id,
        fileKey: d.pdf_file_key,
        folderPath: d.pdf_folder_path,
        originalName: d.pdf_original_name,
      }));
  }

  async getWeeklyBundle(filters: WeeklyBundleFilters) {
    const files = await this.listStoredFiles(filters);
    return this.documentBundleService.buildWeeklyPdfBundle(
      'DDS',
      filters,
      files.map((file) => ({
        fileKey: file.fileKey,
        title: file.title,
        originalName: file.originalName,
        date: file.date,
      })),
    );
  }
}
