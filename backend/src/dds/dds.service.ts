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
import { ReplaceDdsSignaturesDto } from './dto/replace-dds-signatures.dto';
import { User } from '../users/entities/user.entity';
import { WeeklyBundleFilters } from '../common/services/document-bundle.service';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import { DocumentStorageService } from '../common/services/document-storage.service';
import {
  cleanupUploadedFile,
  isS3DisabledUploadError,
} from '../common/storage/storage-compensation.util';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import { SignaturesService } from '../signatures/signatures.service';
import { Signature } from '../signatures/entities/signature.entity';

const TEAM_PHOTO_SIGNATURE_PREFIX = 'team_photo';
const TEAM_PHOTO_REUSE_JUSTIFICATION_TYPE = 'team_photo_reuse_justification';

type HistoricalPhotoHashes = {
  ddsId: string;
  tema: string;
  data: string;
  hashes: string[];
};

type TeamPhotoEvidence = {
  imageData: string;
  capturedAt: string;
  hash: string;
  metadata: {
    userAgent: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
  };
};

@Injectable()
export class DdsService {
  private readonly logger = new Logger(DdsService.name);

  constructor(
    @InjectRepository(Dds)
    private ddsRepository: Repository<Dds>,
    private tenantService: TenantService,
    private readonly documentStorageService: DocumentStorageService,
    private readonly documentGovernanceService: DocumentGovernanceService,
    private readonly signaturesService: SignaturesService,
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

    idsQuery.where('dds.deleted_at IS NULL');
    countQuery.where('dds.deleted_at IS NULL');

    if (tenantId) {
      idsQuery.andWhere('dds.company_id = :tenantId', { tenantId });
      countQuery.andWhere('dds.company_id = :tenantId', { tenantId });
    }

    if (opts?.search?.trim()) {
      const search = `%${opts.search.trim().toLowerCase()}%`;
      const condition = 'LOWER(dds.tema) LIKE :search';
      idsQuery.andWhere(condition, { search });
      countQuery.andWhere(condition, { search });
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
      where: ids.map((id) => ({ id, deleted_at: IsNull() })),
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
    if (
      dds.is_modelo &&
      (status === DdsStatus.PUBLICADO || status === DdsStatus.AUDITADO)
    ) {
      throw new BadRequestException(
        'Modelos de DDS não podem ser publicados ou auditados. Gere um DDS operacional a partir do modelo.',
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
    this.assertFinalDocumentMutable(dds);
    await this.assertReadyForFinalDocument(dds);
    const companyId = dds.company_id;
    const key = this.documentStorageService.generateDocumentKey(
      companyId,
      'dds',
      id,
      file.originalname,
    );
    let uploadedToStorage = false;

    try {
      await this.documentStorageService.uploadFile(
        key,
        file.buffer,
        file.mimetype,
      );
      uploadedToStorage = true;
    } catch (error) {
      if (!isS3DisabledUploadError(error)) {
        throw error;
      }
      // S3 desabilitado — armazena a referência sem upload real
      this.logger.warn(`S3 desabilitado, armazenando referência local: ${key}`);
    }

    const folder = `dds/${companyId}`;
    try {
      await this.documentGovernanceService.registerFinalDocument({
        companyId: dds.company_id,
        module: 'dds',
        entityId: dds.id,
        title: dds.tema || 'DDS',
        documentDate: dds.data || dds.created_at,
        documentCode: this.buildDdsDocumentCode(dds),
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
    } catch (error) {
      if (uploadedToStorage) {
        await cleanupUploadedFile(
          this.logger,
          `dds:${dds.id}`,
          key,
          (fileKey) => this.documentStorageService.deleteFile(fileKey),
        );
      }
      throw error;
    }

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
      url = await this.documentStorageService.getSignedUrl(
        dds.pdf_file_key,
        3600,
      );
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
    excludeDocumentId?: string,
  ): Promise<HistoricalPhotoHashes[]> {
    const tenantId = this.tenantService.getTenantId();

    const recent = await this.ddsRepository
      .createQueryBuilder('dds')
      .select(['dds.id AS id', 'dds.tema AS tema', 'dds.data AS data'])
      .where(tenantId ? 'dds.company_id = :tenantId' : '1=1', { tenantId })
      .andWhere('dds.deleted_at IS NULL')
      .andWhere(excludeDocumentId ? 'dds.id != :excludeDocumentId' : '1=1', {
        excludeDocumentId,
      })
      .orderBy('dds.created_at', 'DESC')
      .limit(limit)
      .getRawMany<{ id: string; tema: string; data: string }>();

    const documentIds = recent.map((item) => item.id);
    const signatures = await this.signaturesService.findManyByDocuments(
      documentIds,
      'DDS',
      {
        companyId: tenantId || undefined,
        typePrefix: TEAM_PHOTO_SIGNATURE_PREFIX,
      },
    );
    const hashesByDocument = signatures.reduce<Record<string, string[]>>(
      (accumulator, signature) => {
        const hash = this.parseTeamPhotoHash(signature);
        if (!hash) {
          return accumulator;
        }
        const current = accumulator[signature.document_id] || [];
        current.push(hash);
        accumulator[signature.document_id] = current;
        return accumulator;
      },
      {},
    );

    return recent.map((item) => ({
      ddsId: item.id,
      tema: item.tema,
      data: item.data,
      hashes: hashesByDocument[item.id] || [],
    }));
  }

  async replaceSignatures(
    id: string,
    dto: ReplaceDdsSignaturesDto,
    authenticatedUserId: string,
  ): Promise<{
    participantSignatures: number;
    teamPhotos: number;
    duplicatePhotoWarnings: string[];
  }> {
    const dds = await this.findOne(id);
    this.assertFinalDocumentMutable(dds);

    if (dds.is_modelo) {
      throw new BadRequestException(
        'Modelos de DDS não podem receber assinaturas de execução.',
      );
    }

    const participantIds = this.getParticipantIds(dds);
    if (participantIds.length === 0) {
      throw new BadRequestException(
        'O DDS precisa ter participantes definidos antes das assinaturas.',
      );
    }

    const providedParticipantSignatures = dto.participant_signatures || [];
    const uniqueParticipantSignatures = new Map(
      providedParticipantSignatures.map((signature) => [
        signature.user_id,
        signature,
      ]),
    );

    if (uniqueParticipantSignatures.size !== participantIds.length) {
      throw new BadRequestException(
        'Todos os participantes do DDS precisam possuir assinatura registrada.',
      );
    }

    const invalidParticipant = Array.from(
      uniqueParticipantSignatures.keys(),
    ).find((userId) => !participantIds.includes(userId));
    if (invalidParticipant) {
      throw new BadRequestException(
        'Assinatura recebida para um participante que nao pertence a este DDS.',
      );
    }

    const missingParticipants = participantIds.filter(
      (participantId) => !uniqueParticipantSignatures.has(participantId),
    );
    if (missingParticipants.length > 0) {
      throw new BadRequestException(
        'Todos os participantes do DDS precisam possuir assinatura registrada.',
      );
    }

    const teamPhotos = dto.team_photos || [];
    const duplicateWarnings = await this.findDuplicateTeamPhotoHashes(
      dds,
      teamPhotos,
    );
    if (
      duplicateWarnings.length > 0 &&
      String(dto.photo_reuse_justification || '').trim().length < 20
    ) {
      throw new BadRequestException(
        'Detectamos reuso potencial de foto. Informe uma justificativa com pelo menos 20 caracteres.',
      );
    }

    const signaturesToPersist = [
      ...Array.from(uniqueParticipantSignatures.values()).map((signature) => ({
        user_id: signature.user_id,
        signer_user_id: signature.user_id,
        signature_data:
          signature.type === 'hmac' ? 'HMAC_PENDING' : signature.signature_data,
        type: signature.type,
        pin: signature.type === 'hmac' ? signature.pin : undefined,
        company_id: dds.company_id,
        document_id: id,
        document_type: 'DDS',
      })),
      ...teamPhotos.map((photo, index) => ({
        user_id: dds.facilitador_id,
        signer_user_id: dds.facilitador_id,
        signature_data: JSON.stringify(photo),
        type: `${TEAM_PHOTO_SIGNATURE_PREFIX}_${index + 1}`,
        company_id: dds.company_id,
        document_id: id,
        document_type: 'DDS',
      })),
      ...(duplicateWarnings.length > 0
        ? [
            {
              user_id: dds.facilitador_id,
              signer_user_id: dds.facilitador_id,
              signature_data: String(
                dto.photo_reuse_justification || '',
              ).trim(),
              type: TEAM_PHOTO_REUSE_JUSTIFICATION_TYPE,
              company_id: dds.company_id,
              document_id: id,
              document_type: 'DDS',
            },
          ]
        : []),
    ];

    await this.signaturesService.replaceDocumentSignatures({
      document_id: id,
      document_type: 'DDS',
      company_id: dds.company_id,
      authenticated_user_id: authenticatedUserId,
      signatures: signaturesToPersist,
    });

    return {
      participantSignatures: participantIds.length,
      teamPhotos: teamPhotos.length,
      duplicatePhotoWarnings: duplicateWarnings,
    };
  }

  async update(id: string, updateDdsDto: UpdateDdsDto): Promise<Dds> {
    const dds = await this.findOne(id);
    this.assertFinalDocumentMutable(dds);
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
      cleanupStoredFile: (fileKey) =>
        this.documentStorageService.deleteFile(fileKey),
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
        ? ({
            ...where,
            company_id: tenantId,
            deleted_at: IsNull(),
          } as Record<string, unknown>)
        : ({ ...where, deleted_at: IsNull() } as Record<string, unknown>),
    });
  }

  async listStoredFiles(filters: WeeklyBundleFilters) {
    return this.documentGovernanceService.listFinalDocuments('dds', filters);
  }

  async getWeeklyBundle(filters: WeeklyBundleFilters) {
    return this.documentGovernanceService.getModuleWeeklyBundle(
      'dds',
      'DDS',
      filters,
    );
  }

  private async assertReadyForFinalDocument(dds: Dds): Promise<void> {
    if (dds.is_modelo) {
      throw new BadRequestException(
        'Modelos de DDS nao podem receber PDF final. Gere um DDS operacional a partir do modelo.',
      );
    }

    if (dds.status === DdsStatus.RASCUNHO) {
      throw new BadRequestException(
        'O DDS precisa estar publicado ou auditado antes do anexo do PDF final.',
      );
    }

    const participantIds = this.getParticipantIds(dds);
    if (participantIds.length === 0) {
      throw new BadRequestException(
        'O DDS precisa ter participantes definidos antes do PDF final.',
      );
    }

    const signatures = await this.signaturesService.findByDocument(
      dds.id,
      'DDS',
    );
    const participantSigners = new Set(
      signatures
        .filter(
          (signature) =>
            !this.isTeamPhotoSignature(signature.type) &&
            signature.type !== TEAM_PHOTO_REUSE_JUSTIFICATION_TYPE,
        )
        .map((signature) => signature.user_id),
    );

    const missingParticipants = participantIds.filter(
      (participantId) => !participantSigners.has(participantId),
    );

    if (missingParticipants.length > 0) {
      throw new BadRequestException(
        'Todos os participantes precisam assinar o DDS antes do anexo do PDF final.',
      );
    }

    const duplicateWarnings = await this.findDuplicateTeamPhotoHashes(
      dds,
      signatures
        .filter((signature) => this.isTeamPhotoSignature(signature.type))
        .map((signature) => this.parseTeamPhoto(signature))
        .filter((photo): photo is TeamPhotoEvidence => Boolean(photo)),
    );

    const justification = signatures.find(
      (signature) => signature.type === TEAM_PHOTO_REUSE_JUSTIFICATION_TYPE,
    );

    if (
      duplicateWarnings.length > 0 &&
      String(justification?.signature_data || '').trim().length < 20
    ) {
      throw new BadRequestException(
        'O DDS possui foto potencialmente reutilizada e exige justificativa registrada antes do PDF final.',
      );
    }
  }

  private async findDuplicateTeamPhotoHashes(
    dds: Dds,
    teamPhotos: TeamPhotoEvidence[],
  ): Promise<string[]> {
    if (teamPhotos.length === 0) {
      return [];
    }

    const historicalHashes = await this.getHistoricalPhotoHashes(250, dds.id);
    const knownHashes = new Set(
      historicalHashes.flatMap((item) => item.hashes).filter(Boolean),
    );

    return Array.from(
      new Set(
        teamPhotos
          .map((photo) => photo.hash)
          .filter((hash) => Boolean(hash) && knownHashes.has(hash)),
      ),
    );
  }

  private getParticipantIds(dds: Dds): string[] {
    return Array.from(
      new Set((dds.participants || []).map((participant) => participant.id)),
    );
  }

  private isTeamPhotoSignature(type: string): boolean {
    return /^team_photo_\d+$/i.test(type);
  }

  private parseTeamPhotoHash(signature: Signature): string | null {
    return this.parseTeamPhoto(signature)?.hash || null;
  }

  private parseTeamPhoto(signature: Signature): TeamPhotoEvidence | null {
    try {
      const parsed = JSON.parse(signature.signature_data) as TeamPhotoEvidence;
      if (!parsed?.hash || !parsed?.imageData) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private assertFinalDocumentMutable(dds: Dds): void {
    if (dds.pdf_file_key) {
      throw new BadRequestException(
        'DDS com PDF final anexado. Edição bloqueada. Gere um novo DDS para alterar o documento.',
      );
    }
  }

  private buildDdsDocumentCode(
    dds: Pick<Dds, 'id' | 'tema' | 'data' | 'created_at'>,
  ): string {
    const candidateDate = dds.data
      ? new Date(dds.data)
      : dds.created_at
        ? new Date(dds.created_at)
        : new Date();
    const year = Number.isNaN(candidateDate.getTime())
      ? new Date().getFullYear()
      : candidateDate.getFullYear();
    const reference = String(dds.id || dds.tema || 'DDS')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-8)
      .toUpperCase();

    return `DDS-${year}-${reference || String(Date.now()).slice(-6)}`;
  }
}
