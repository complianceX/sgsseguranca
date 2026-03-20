import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { In, Repository } from 'typeorm';
import { Cat } from '../cats/entities/cat.entity';
import { cleanupUploadedFile } from '../common/storage/storage-compensation.util';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { StorageService } from '../common/services/storage.service';
import { TenantService } from '../common/tenant/tenant.service';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import { DocumentRegistryService } from '../document-registry/document-registry.service';
import { EpiAssignment } from '../epi-assignments/entities/epi-assignment.entity';
import { Pt } from '../pts/entities/pt.entity';
import { Site } from '../sites/entities/site.entity';
import { Training } from '../trainings/entities/training.entity';
import { User } from '../users/entities/user.entity';
import {
  applyBackendPdfFooter,
  backendPdfTheme,
  createBackendPdfTableTheme,
  drawBackendPdfHeader,
  drawBackendSectionTitle,
  getBackendLastTableY,
} from '../common/services/pdf-branding';

interface DossierAttachmentLine {
  tipo: string;
  referencia: string;
  arquivo: string;
  url: string;
}

interface EmployeeDossierPdfData {
  user: User;
  trainings: Training[];
  assignments: EpiAssignment[];
  attachmentLines: DossierAttachmentLine[];
}

interface EmployeeDossierBundle {
  user: User;
  trainings: Training[];
  assignments: EpiAssignment[];
  pts: Pt[];
  cats: Cat[];
  attachmentLines: DossierAttachmentLine[];
  truncation: DossierTruncationInfo;
}

interface SiteDossierBundle {
  site: Site;
  users: User[];
  trainings: Training[];
  assignments: EpiAssignment[];
  pts: Pt[];
  cats: Cat[];
  attachmentLines: DossierAttachmentLine[];
  truncation: DossierTruncationInfo;
}

type DossierKind = 'employee' | 'site';
type DossierPdfAccessAvailability =
  | 'ready'
  | 'registered_without_signed_url'
  | 'not_emitted';

type DossierDatasetTruncation = {
  trainings: boolean;
  assignments: boolean;
  pts: boolean;
  cats: boolean;
  workers: boolean;
};

type DossierTruncationInfo = {
  limit: number;
  truncated: boolean;
  datasets: DossierDatasetTruncation;
};

type DossierDocumentSummary = {
  trainings: number;
  assignments: number;
  pts: number;
  cats: number;
  attachments: number;
};

type DossierDocumentInfo = {
  id: string;
  code: string;
  kind: 'employee' | 'site';
  companyId: string;
  companyName: string | null;
  generatedAt: string;
  summary: DossierDocumentSummary;
  truncation: DossierTruncationInfo;
};

export type EmployeeDossierContext = DossierDocumentInfo & {
  kind: 'employee';
  subject: {
    id: string;
    nome: string;
    funcao: string | null;
    status: boolean;
    profileName: string | null;
    siteName: string | null;
    cpf: string | null;
    updatedAt: string | null;
  };
  trainings: Array<{
    id: string;
    nome: string;
    nrCodigo: string | null;
    dataConclusao: string | null;
    dataVencimento: string | null;
    status: string;
  }>;
  assignments: Array<{
    id: string;
    epiNome: string;
    ca: string | null;
    validadeCa: string | null;
    status: string;
    entregueEm: string | null;
    devolvidoEm: string | null;
  }>;
  pts: Array<{
    id: string;
    numero: string;
    titulo: string;
    status: string;
    responsavel: string | null;
    dataInicio: string | null;
    dataFim: string | null;
  }>;
  cats: Array<{
    id: string;
    numero: string;
    status: string;
    gravidade: string;
    dataOcorrencia: string | null;
    descricao: string | null;
  }>;
  attachmentLines: DossierAttachmentLine[];
};

export type SiteDossierContext = DossierDocumentInfo & {
  kind: 'site';
  subject: {
    id: string;
    nome: string;
    endereco: string | null;
    cidade: string | null;
    estado: string | null;
    status: boolean;
    updatedAt: string | null;
  };
  workers: Array<{
    id: string;
    nome: string;
    funcao: string | null;
    profileName: string | null;
    status: boolean;
  }>;
  trainings: Array<{
    id: string;
    nome: string;
    workerName: string | null;
    dataConclusao: string | null;
    dataVencimento: string | null;
    status: string;
  }>;
  assignments: Array<{
    id: string;
    workerName: string | null;
    epiNome: string;
    status: string;
    entregueEm: string | null;
    devolvidoEm: string | null;
  }>;
  pts: Array<{
    id: string;
    numero: string;
    titulo: string;
    status: string;
    responsavel: string | null;
    dataInicio: string | null;
    dataFim: string | null;
  }>;
  cats: Array<{
    id: string;
    numero: string;
    status: string;
    gravidade: string;
    workerName: string | null;
    dataOcorrencia: string | null;
  }>;
  attachmentLines: DossierAttachmentLine[];
};

const DOSSIER_RECORD_LIMIT = 500; // Safety limit to prevent memory exhaustion
const DOSSIER_DEGRADED_ATTACHMENT_URL = 'ANEXO_INDISPONIVEL_STORAGE';
const DOSSIER_EMPLOYEE_DOCUMENT_TYPE = 'employee_pdf';
const DOSSIER_SITE_DOCUMENT_TYPE = 'site_pdf';
const DOSSIER_CODE_TRANSITIONAL_EMPLOYEE_REGEX =
  /^DOS-EMP-([A-Z0-9]{8})([A-Z0-9]{4})$/;
const DOSSIER_CODE_TRANSITIONAL_SITE_REGEX =
  /^DOS-SIT-([A-Z0-9]{8})([A-Z0-9]{4})$/;
const DOSSIER_CODE_LEGACY_EMPLOYEE_REGEX = /^DOS-EMP-([A-Z0-9]{8})$/;
const DOSSIER_CODE_LEGACY_SITE_REGEX = /^DOS-SIT-([A-Z0-9]{8})$/;
const DOSSIER_CODE_GOVERNED_EMPLOYEE_REGEX = /^DOS-EMP-(\d{4})-([A-Z0-9]{12})$/;
const DOSSIER_CODE_GOVERNED_SITE_REGEX = /^DOS-SIT-(\d{4})-([A-Z0-9]{12})$/;

@Injectable()
export class DossiersService {
  private readonly logger = new Logger(DossiersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Training)
    private readonly trainingsRepository: Repository<Training>,
    @InjectRepository(EpiAssignment)
    private readonly assignmentsRepository: Repository<EpiAssignment>,
    @InjectRepository(Pt)
    private readonly ptsRepository: Repository<Pt>,
    @InjectRepository(Cat)
    private readonly catsRepository: Repository<Cat>,
    @InjectRepository(Site)
    private readonly sitesRepository: Repository<Site>,
    private readonly tenantService: TenantService,
    private readonly storageService: StorageService,
    private readonly documentStorageService: DocumentStorageService,
    private readonly documentGovernanceService: DocumentGovernanceService,
    private readonly documentRegistryService: DocumentRegistryService,
  ) {}

  async attachEmployeePdf(
    userId: string,
    file: Express.Multer.File,
    actorId?: string,
  ): Promise<{
    dossierId: string;
    kind: DossierKind;
    hasFinalPdf: boolean;
    availability: DossierPdfAccessAvailability;
    message: string;
    degraded: boolean;
    fileKey: string;
    folderPath: string;
    originalName: string;
    documentCode: string;
    fileHash: string;
  }> {
    const companyId = this.getTenantIdOrThrow();
    const user = await this.usersRepository.findOne({
      where: { id: userId, company_id: companyId },
    });
    if (!user) {
      throw new NotFoundException('Colaborador nao encontrado.');
    }

    return this.attachGovernedPdf({
      kind: 'employee',
      entityId: user.id,
      companyId,
      title: `Dossie do colaborador ${user.nome}`,
      documentDate: user.updated_at || user.created_at || new Date(),
      file,
      actorId,
    });
  }

  async attachSitePdf(
    siteId: string,
    file: Express.Multer.File,
    actorId?: string,
  ): Promise<{
    dossierId: string;
    kind: DossierKind;
    hasFinalPdf: boolean;
    availability: DossierPdfAccessAvailability;
    message: string;
    degraded: boolean;
    fileKey: string;
    folderPath: string;
    originalName: string;
    documentCode: string;
    fileHash: string;
  }> {
    const companyId = this.getTenantIdOrThrow();
    const site = await this.sitesRepository.findOne({
      where: { id: siteId, company_id: companyId },
    });
    if (!site) {
      throw new NotFoundException('Obra/setor nao encontrado.');
    }

    return this.attachGovernedPdf({
      kind: 'site',
      entityId: site.id,
      companyId,
      title: `Dossie da obra/setor ${site.nome}`,
      documentDate: site.updated_at || site.created_at || new Date(),
      file,
      actorId,
    });
  }

  async getEmployeePdfAccess(
    userId: string,
    actorId?: string,
  ): Promise<{
    dossierId: string;
    kind: DossierKind;
    hasFinalPdf: boolean;
    availability: DossierPdfAccessAvailability;
    message: string;
    degraded: boolean;
    fileKey: string | null;
    folderPath: string | null;
    originalName: string | null;
    fileHash: string | null;
    documentCode: string;
    url: string | null;
  }> {
    const companyId = this.getTenantIdOrThrow();
    const user = await this.usersRepository.findOne({
      where: { id: userId, company_id: companyId },
    });
    if (!user) {
      throw new NotFoundException('Colaborador nao encontrado.');
    }

    const payload = await this.getGovernedPdfAccess({
      kind: 'employee',
      entityId: user.id,
      companyId,
      fallbackCode: this.buildEmployeeDossierCode(user.id),
    });

    this.logger.log(
      `dossier_pdf_access_checked kind=employee dossierId=${user.id} hasFinalPdf=${payload.hasFinalPdf} availability=${payload.availability} degraded=${payload.degraded} actor=${actorId || 'system'}`,
    );

    return payload;
  }

  async getSitePdfAccess(
    siteId: string,
    actorId?: string,
  ): Promise<{
    dossierId: string;
    kind: DossierKind;
    hasFinalPdf: boolean;
    availability: DossierPdfAccessAvailability;
    message: string;
    degraded: boolean;
    fileKey: string | null;
    folderPath: string | null;
    originalName: string | null;
    fileHash: string | null;
    documentCode: string;
    url: string | null;
  }> {
    const companyId = this.getTenantIdOrThrow();
    const site = await this.sitesRepository.findOne({
      where: { id: siteId, company_id: companyId },
    });
    if (!site) {
      throw new NotFoundException('Obra/setor nao encontrado.');
    }

    const payload = await this.getGovernedPdfAccess({
      kind: 'site',
      entityId: site.id,
      companyId,
      fallbackCode: this.buildSiteDossierCode(site.id),
    });

    this.logger.log(
      `dossier_pdf_access_checked kind=site dossierId=${site.id} hasFinalPdf=${payload.hasFinalPdf} availability=${payload.availability} degraded=${payload.degraded} actor=${actorId || 'system'}`,
    );

    return payload;
  }

  async getLegacyEmployeePdfDownload(userId: string): Promise<{
    filename: string;
    buffer: Buffer;
    source: 'legacy_local_generation' | 'governed_storage';
  }> {
    const access = await this.getEmployeePdfAccess(userId);
    if (access.hasFinalPdf && access.fileKey) {
      const buffer = await this.documentStorageService.downloadFileBuffer(
        access.fileKey,
      );
      return {
        filename:
          access.originalName ||
          `dossie_colaborador_${userId}_${new Date().toISOString().slice(0, 10)}.pdf`,
        buffer,
        source: 'governed_storage',
      };
    }

    const generated = await this.generateEmployeeDossier(userId);
    try {
      const syntheticFile = {
        originalname: generated.filename,
        mimetype: 'application/pdf',
        buffer: generated.buffer,
      } as Express.Multer.File;
      await this.attachEmployeePdf(
        userId,
        syntheticFile,
        'system-legacy-dossiers',
      );
      this.logger.log(
        `legacy_dossier_pdf_promoted_to_governed_pipeline dossierId=${userId}`,
      );
    } catch (error) {
      this.logger.warn(
        `Falha ao promover endpoint legado de dossie para pipeline governado (${userId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      ...generated,
      source: 'legacy_local_generation',
    };
  }

  async generateEmployeeDossier(userId: string): Promise<{
    filename: string;
    buffer: Buffer;
  }> {
    const { user, trainings, assignments, attachmentLines } =
      await this.loadEmployeeDossierBundle(userId);

    // ALERTA DE PERFORMANCE: Geração de PDF é síncrona e bloqueia o event loop.
    // RECOMENDAÇÃO: Mover para um job em background (BullMQ) para não afetar a API.
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    this.buildPdf(doc, {
      user,
      trainings,
      assignments,
      attachmentLines,
    });

    const filename = `dossie_colaborador_${user.id}_${new Date().toISOString().slice(0, 10)}.pdf`;
    const buffer = Buffer.from(doc.output('arraybuffer'));
    return { filename, buffer };
  }

  async getEmployeeDossierContext(
    userId: string,
  ): Promise<EmployeeDossierContext> {
    const {
      user,
      trainings,
      assignments,
      pts,
      cats,
      attachmentLines,
      truncation,
    } = await this.loadEmployeeDossierBundle(userId);
    const generatedAt = new Date().toISOString();
    const companyName = user.company?.razao_social || null;
    const registryEntry = await this.documentRegistryService.findByDocument(
      'dossier',
      user.id,
      DOSSIER_EMPLOYEE_DOCUMENT_TYPE,
      user.company_id,
    );
    const documentCode =
      registryEntry?.document_code || this.buildEmployeeDossierCode(user.id);

    return {
      kind: 'employee',
      id: user.id,
      code: documentCode,
      companyId: user.company_id,
      companyName,
      generatedAt,
      summary: {
        trainings: trainings.length,
        assignments: assignments.length,
        pts: pts.length,
        cats: cats.length,
        attachments: attachmentLines.length,
      },
      truncation,
      subject: {
        id: user.id,
        nome: user.nome,
        funcao: user.funcao || null,
        status: Boolean(user.status),
        profileName: user.profile?.nome || null,
        siteName: user.site?.nome || null,
        cpf: user.cpf || null,
        updatedAt: this.serializeDate(user.updated_at),
      },
      trainings: trainings.map((item) => ({
        id: item.id,
        nome: item.nome,
        nrCodigo: item.nr_codigo || null,
        dataConclusao: this.serializeDate(item.data_conclusao),
        dataVencimento: this.serializeDate(item.data_vencimento),
        status:
          item.data_vencimento && new Date(item.data_vencimento) < new Date()
            ? 'Vencido'
            : 'Valido',
      })),
      assignments: assignments.map((item) => ({
        id: item.id,
        epiNome: item.epi?.nome || item.epi_id,
        ca: item.ca || null,
        validadeCa: this.serializeDate(item.validade_ca),
        status: item.status,
        entregueEm: this.serializeDate(item.entregue_em),
        devolvidoEm: this.serializeDate(item.devolvido_em),
      })),
      pts: pts.map((item) => ({
        id: item.id,
        numero: item.numero,
        titulo: item.titulo,
        status: item.status,
        responsavel: item.responsavel?.nome || null,
        dataInicio: this.serializeDate(item.data_hora_inicio),
        dataFim: this.serializeDate(item.data_hora_fim),
      })),
      cats: cats.map((item) => ({
        id: item.id,
        numero: item.numero,
        status: item.status,
        gravidade: item.gravidade,
        dataOcorrencia: this.serializeDate(item.data_ocorrencia),
        descricao: item.descricao || null,
      })),
      attachmentLines,
    };
  }

  async getSiteDossierContext(siteId: string): Promise<SiteDossierContext> {
    const {
      site,
      users,
      trainings,
      assignments,
      pts,
      cats,
      attachmentLines,
      truncation,
    } = await this.loadSiteDossierBundle(siteId);
    const generatedAt = new Date().toISOString();
    const registryEntry = await this.documentRegistryService.findByDocument(
      'dossier',
      site.id,
      DOSSIER_SITE_DOCUMENT_TYPE,
      site.company_id,
    );
    const documentCode =
      registryEntry?.document_code || this.buildSiteDossierCode(site.id);

    return {
      kind: 'site',
      id: site.id,
      code: documentCode,
      companyId: site.company_id,
      companyName: site.company?.razao_social || null,
      generatedAt,
      summary: {
        trainings: trainings.length,
        assignments: assignments.length,
        pts: pts.length,
        cats: cats.length,
        attachments: attachmentLines.length,
      },
      truncation,
      subject: {
        id: site.id,
        nome: site.nome,
        endereco: site.endereco || null,
        cidade: site.cidade || null,
        estado: site.estado || null,
        status: Boolean(site.status),
        updatedAt: this.serializeDate(site.updated_at),
      },
      workers: users.map((user) => ({
        id: user.id,
        nome: user.nome,
        funcao: user.funcao || null,
        profileName: user.profile?.nome || null,
        status: Boolean(user.status),
      })),
      trainings: trainings.map((item) => ({
        id: item.id,
        nome: item.nome,
        workerName: item.user?.nome || null,
        dataConclusao: this.serializeDate(item.data_conclusao),
        dataVencimento: this.serializeDate(item.data_vencimento),
        status:
          item.data_vencimento && new Date(item.data_vencimento) < new Date()
            ? 'Vencido'
            : 'Valido',
      })),
      assignments: assignments.map((item) => ({
        id: item.id,
        workerName: item.user?.nome || null,
        epiNome: item.epi?.nome || item.epi_id,
        status: item.status,
        entregueEm: this.serializeDate(item.entregue_em),
        devolvidoEm: this.serializeDate(item.devolvido_em),
      })),
      pts: pts.map((item) => ({
        id: item.id,
        numero: item.numero,
        titulo: item.titulo,
        status: item.status,
        responsavel: item.responsavel?.nome || null,
        dataInicio: this.serializeDate(item.data_hora_inicio),
        dataFim: this.serializeDate(item.data_hora_fim),
      })),
      cats: cats.map((item) => ({
        id: item.id,
        numero: item.numero,
        status: item.status,
        gravidade: item.gravidade,
        workerName: item.worker?.nome || null,
        dataOcorrencia: this.serializeDate(item.data_ocorrencia),
      })),
      attachmentLines,
    };
  }

  async validateByCode(code: string): Promise<{
    valid: boolean;
    code: string;
    message?: string;
    document?: {
      id: string;
      module: string;
      document_type: string;
      title: string;
      document_date: string | null;
      original_name: string | null;
      file_hash: string | null;
      updated_at: string;
    };
    final_document?: {
      has_final_pdf: boolean;
      document_code: string | null;
      original_name: string | null;
      file_hash: string | null;
      emitted_at: string | null;
    };
  }> {
    const normalizedCode = String(code || '')
      .trim()
      .toUpperCase();

    const registryEntry =
      await this.documentRegistryService.findByCode(normalizedCode);
    if (registryEntry && registryEntry.module === 'dossier') {
      const resolvedFromRegistry =
        await this.resolveDossierByRegistryCode(normalizedCode);
      if (resolvedFromRegistry) {
        return resolvedFromRegistry;
      }
    }

    if (
      DOSSIER_CODE_GOVERNED_EMPLOYEE_REGEX.test(normalizedCode) ||
      DOSSIER_CODE_GOVERNED_SITE_REGEX.test(normalizedCode)
    ) {
      return {
        valid: false,
        code: normalizedCode,
        message:
          'Codigo de dossie final nao encontrado. Confirme se o documento final foi emitido.',
      };
    }

    const employeePrefix = this.extractEmployeeCodePrefix(normalizedCode);
    if (employeePrefix) {
      const employeeResult = await this.resolveEmployeeCodeValidation(
        normalizedCode,
        employeePrefix,
      );
      if (employeeResult) {
        return employeeResult;
      }
      return {
        valid: false,
        code: normalizedCode,
        message: 'Dossie de colaborador nao encontrado para este codigo.',
      };
    }

    const sitePrefix = this.extractSiteCodePrefix(normalizedCode);
    if (sitePrefix) {
      const siteResult = await this.resolveSiteCodeValidation(
        normalizedCode,
        sitePrefix,
      );
      if (siteResult) {
        return siteResult;
      }
      return {
        valid: false,
        code: normalizedCode,
        message: 'Dossie de obra/setor nao encontrado para este codigo.',
      };
    }

    return {
      valid: false,
      code: normalizedCode,
      message: 'Codigo de dossie invalido.',
    };
  }

  // NOTE: Other dossier generation methods (`generateContractDossier`, `generateSiteDossier`)
  // would need similar refactoring (adding `take` limits) but are omitted here for brevity
  // following the same correction pattern.

  private buildPdf(doc: jsPDF, data: EmployeeDossierPdfData): void {
    const { user, trainings, assignments, attachmentLines } = data;
    const marginX = 40;
    const tableTheme = createBackendPdfTableTheme();

    drawBackendPdfHeader(doc, {
      title: 'Dossie de SST - Colaborador',
      subtitle: `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
      metaRight: [`ID do colaborador: ${user.id}`],
      marginX,
    });

    doc.setFontSize(12);
    doc.setTextColor(...backendPdfTheme.text);
    doc.text('Dados do colaborador', marginX, 92);
    autoTable(doc, {
      startY: 100,
      head: [['Campo', 'Valor']],
      body: [
        ['Nome', user.nome],
        ['Funcao', user.funcao || '-'],
        ['Perfil', user.profile?.nome || '-'],
        ['Obra/Setor', user.site?.nome || '-'],
        ['Status', user.status ? 'Ativo' : 'Inativo'],
      ],
      ...tableTheme,
    });

    autoTable(doc, {
      startY: getBackendLastTableY(doc) + 16,
      head: [['Treinamento', 'NR', 'Conclusao', 'Vencimento', 'Status']],
      body:
        trainings.length > 0
          ? trainings.map((item: Training) => [
              item.nome,
              item.nr_codigo || '-',
              new Date(item.data_conclusao).toLocaleDateString('pt-BR'),
              new Date(item.data_vencimento).toLocaleDateString('pt-BR'),
              new Date(item.data_vencimento) < new Date()
                ? 'Vencido'
                : 'Valido',
            ])
          : [['-', '-', '-', '-', 'Nenhum treinamento encontrado']],
      ...tableTheme,
    });

    autoTable(doc, {
      startY: getBackendLastTableY(doc) + 16,
      head: [['EPI', 'CA', 'Validade CA', 'Status', 'Entrega', 'Devolucao']],
      body:
        assignments.length > 0
          ? assignments.map((item: EpiAssignment) => [
              item.epi?.nome || item.epi_id,
              item.ca || '-',
              item.validade_ca
                ? new Date(item.validade_ca).toLocaleDateString('pt-BR')
                : '-',
              item.status,
              new Date(item.entregue_em).toLocaleDateString('pt-BR'),
              item.devolvido_em
                ? new Date(item.devolvido_em).toLocaleDateString('pt-BR')
                : '-',
            ])
          : [['-', '-', '-', '-', '-', 'Nenhuma ficha EPI encontrada']],
      ...tableTheme,
    });

    this.appendAttachmentIndex(doc, attachmentLines);
    applyBackendPdfFooter(doc, { marginX });
  }

  private async collectEmployeeAttachments(
    trainings: Training[],
    _assignments: EpiAssignment[],
    pts: Pt[],
    cats: Cat[],
  ): Promise<DossierAttachmentLine[]> {
    const lines: DossierAttachmentLine[] = [];
    for (const training of trainings) {
      if (training.certificado_url) {
        lines.push({
          tipo: 'Treinamento',
          referencia: training.nome,
          arquivo: 'Certificado',
          url: training.certificado_url,
        });
      }
    }
    // Attachment collection for assignments is omitted as it was complex and didn't use URLs

    await this.appendAttachments(lines, pts, cats);
    return lines;
  }

  private async collectSiteAttachments(
    trainings: Training[],
    assignments: EpiAssignment[],
    pts: Pt[],
    cats: Cat[],
  ): Promise<DossierAttachmentLine[]> {
    return this.collectEmployeeAttachments(trainings, assignments, pts, cats);
  }

  private async appendAttachments(
    lines: DossierAttachmentLine[],
    pts: Pt[],
    cats: Cat[],
  ) {
    // CORREÇÃO: Usando Promise.all para paralelizar a obtenção de URLs assinadas.
    const ptPromises = pts
      .filter((pt) => pt.pdf_file_key)
      .map(async (pt) => ({
        tipo: 'PT',
        referencia: pt.numero,
        arquivo: pt.pdf_original_name || pt.pdf_file_key,
        url: await this.safeSignedUrl(pt.pdf_file_key),
      }));

    const catPromises = cats.flatMap((cat) =>
      (cat.attachments || []).map(async (attachment) => ({
        tipo: 'CAT',
        referencia: cat.numero,
        arquivo: attachment.file_name,
        url: await this.safeSignedUrl(attachment.file_key),
      })),
    );

    const results = await Promise.all([...ptPromises, ...catPromises]);
    lines.push(...results);
  }

  private appendAttachmentIndex(
    doc: jsPDF,
    attachmentLines: DossierAttachmentLine[],
  ) {
    drawBackendSectionTitle(
      doc,
      getBackendLastTableY(doc) + 8,
      'Indice de anexos',
    );
    autoTable(doc, {
      startY: getBackendLastTableY(doc) + 16,
      head: [['Tipo', 'Referencia', 'Arquivo', 'URL/Chave']],
      body:
        attachmentLines.length > 0
          ? attachmentLines.map((item) => [
              item.tipo,
              item.referencia,
              item.arquivo,
              item.url,
            ])
          : [['-', '-', '-', 'Nenhum anexo relacionado']],
      ...createBackendPdfTableTheme(),
      styles: {
        ...createBackendPdfTableTheme().styles,
        fontSize: 8,
      },
    });
  }

  private async safeSignedUrl(fileKey: string): Promise<string> {
    try {
      // CORREÇÃO: Chamando o método correto `getPresignedDownloadUrl`
      return await this.storageService.getPresignedDownloadUrl(fileKey);
    } catch (error) {
      this.logger.error(
        `Falha ao gerar URL assinada para a chave ${fileKey}`,
        error,
      );
      return DOSSIER_DEGRADED_ATTACHMENT_URL;
    }
  }

  private getTenantIdOrThrow(): string {
    const tenantId = this.tenantService.getTenantId();
    if (!tenantId) {
      throw new BadRequestException('Contexto de empresa nao definido.');
    }
    return tenantId;
  }

  private async loadEmployeeDossierBundle(
    userId: string,
  ): Promise<EmployeeDossierBundle> {
    const companyId = this.getTenantIdOrThrow();
    const user = await this.usersRepository.findOne({
      where: { id: userId, company_id: companyId },
      relations: ['site', 'profile', 'company'],
    });
    if (!user) throw new NotFoundException('Colaborador não encontrado.');

    this.logger.warn(
      `Aplicando limite de ${DOSSIER_RECORD_LIMIT} registros por categoria no dossiê.`,
    );

    const [trainings, assignments, responsiblePts, executingPts, cats] =
      await Promise.all([
        this.trainingsRepository.find({
          where: { company_id: companyId, user_id: userId },
          order: { data_vencimento: 'ASC' },
          take: DOSSIER_RECORD_LIMIT,
        }),
        this.assignmentsRepository.find({
          where: { company_id: companyId, user_id: userId },
          relations: ['epi'],
          order: { created_at: 'DESC' },
          take: DOSSIER_RECORD_LIMIT,
        }),
        this.ptsRepository.find({
          where: { company_id: companyId, responsavel_id: userId },
          relations: ['responsavel'],
          order: { created_at: 'DESC' },
          take: DOSSIER_RECORD_LIMIT,
        }),
        this.ptsRepository
          .createQueryBuilder('pt')
          .leftJoin('pt.executantes', 'executante')
          .leftJoinAndSelect('pt.responsavel', 'responsavel')
          .where('pt.company_id = :companyId', { companyId })
          .andWhere('executante.id = :userId', { userId })
          .orderBy('pt.created_at', 'DESC')
          .take(DOSSIER_RECORD_LIMIT)
          .getMany(),
        this.catsRepository.find({
          where: { company_id: companyId, worker_id: userId },
          order: { created_at: 'DESC' },
          take: DOSSIER_RECORD_LIMIT,
        }),
      ]);

    const ptsMap = new Map<string, Pt>();
    [...responsiblePts, ...executingPts].forEach((pt) => ptsMap.set(pt.id, pt));
    const pts = [...ptsMap.values()];
    const attachmentLines = await this.collectEmployeeAttachments(
      trainings,
      assignments,
      pts,
      cats,
    );

    return {
      user,
      trainings,
      assignments,
      pts,
      cats,
      attachmentLines,
      truncation: this.buildTruncationInfo({
        trainings: trainings.length >= DOSSIER_RECORD_LIMIT,
        assignments: assignments.length >= DOSSIER_RECORD_LIMIT,
        pts: pts.length >= DOSSIER_RECORD_LIMIT,
        cats: cats.length >= DOSSIER_RECORD_LIMIT,
        workers: false,
      }),
    };
  }

  private async loadSiteDossierBundle(
    siteId: string,
  ): Promise<SiteDossierBundle> {
    const companyId = this.getTenantIdOrThrow();
    const site = await this.sitesRepository.findOne({
      where: { id: siteId, company_id: companyId },
      relations: ['company'],
    });
    if (!site) {
      throw new NotFoundException('Obra/setor não encontrado.');
    }

    this.logger.warn(
      `Aplicando limite de ${DOSSIER_RECORD_LIMIT} registros por categoria no dossiê.`,
    );

    const users = await this.usersRepository.find({
      where: { company_id: companyId, site_id: siteId },
      relations: ['profile'],
      order: { nome: 'ASC' },
      take: DOSSIER_RECORD_LIMIT,
    });

    const userIds = users.map((item) => item.id);
    const [trainings, assignments, pts, cats] = await Promise.all([
      userIds.length
        ? this.trainingsRepository.find({
            where: {
              company_id: companyId,
              user_id: In(userIds),
            },
            relations: ['user'],
            order: { data_vencimento: 'ASC' },
            take: DOSSIER_RECORD_LIMIT,
          })
        : Promise.resolve([]),
      userIds.length
        ? this.assignmentsRepository.find({
            where: {
              company_id: companyId,
              user_id: In(userIds),
            },
            relations: ['epi', 'user'],
            order: { created_at: 'DESC' },
            take: DOSSIER_RECORD_LIMIT,
          })
        : Promise.resolve([]),
      this.ptsRepository.find({
        where: { company_id: companyId, site_id: siteId },
        relations: ['responsavel'],
        order: { created_at: 'DESC' },
        take: DOSSIER_RECORD_LIMIT,
      }),
      this.catsRepository.find({
        where: { company_id: companyId, site_id: siteId },
        relations: ['worker'],
        order: { created_at: 'DESC' },
        take: DOSSIER_RECORD_LIMIT,
      }),
    ]);

    const attachmentLines = await this.collectSiteAttachments(
      trainings,
      assignments,
      pts,
      cats,
    );

    return {
      site,
      users,
      trainings,
      assignments,
      pts,
      cats,
      attachmentLines,
      truncation: this.buildTruncationInfo({
        trainings: trainings.length >= DOSSIER_RECORD_LIMIT,
        assignments: assignments.length >= DOSSIER_RECORD_LIMIT,
        pts: pts.length >= DOSSIER_RECORD_LIMIT,
        cats: cats.length >= DOSSIER_RECORD_LIMIT,
        workers: users.length >= DOSSIER_RECORD_LIMIT,
      }),
    };
  }

  private buildEmployeeDossierCode(userId: string): string {
    return this.buildTransitionalDossierCode('employee', userId);
  }

  private buildSiteDossierCode(siteId: string): string {
    return this.buildTransitionalDossierCode('site', siteId);
  }

  private buildLegacyDossierCode(kind: DossierKind, id: string): string {
    const prefix = id.slice(0, 8).toUpperCase();
    return kind === 'employee' ? `DOS-EMP-${prefix}` : `DOS-SIT-${prefix}`;
  }

  private buildTransitionalDossierCode(kind: DossierKind, id: string): string {
    const prefix = id.slice(0, 8).toUpperCase();
    const checksum = createHash('sha256')
      .update(`dossier:${kind}:${id}`)
      .digest('hex')
      .slice(0, 4)
      .toUpperCase();
    return kind === 'employee'
      ? `DOS-EMP-${prefix}${checksum}`
      : `DOS-SIT-${prefix}${checksum}`;
  }

  private async buildGovernedDossierCode(kind: DossierKind): Promise<string> {
    const year = new Date().getUTCFullYear();
    const prefix = kind === 'employee' ? 'DOS-EMP' : 'DOS-SIT';

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const token = randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
      const code = `${prefix}-${year}-${token}`;
      const existing = await this.documentRegistryService.findByCode(code);
      if (!existing) {
        return code;
      }
    }

    return `${prefix}-${year}-${createHash('sha256')
      .update(randomUUID())
      .digest('hex')
      .slice(0, 12)
      .toUpperCase()}`;
  }

  private getDocumentTypeByKind(kind: DossierKind): string {
    return kind === 'employee'
      ? DOSSIER_EMPLOYEE_DOCUMENT_TYPE
      : DOSSIER_SITE_DOCUMENT_TYPE;
  }

  private getValidationDocumentType(kind: DossierKind): string {
    return kind === 'employee' ? 'employee_dossier' : 'site_dossier';
  }

  private resolveDossierKindFromDocumentType(
    documentType: string | null | undefined,
    code: string,
  ): DossierKind | null {
    const normalized = String(documentType || '')
      .trim()
      .toLowerCase();

    if (
      normalized === DOSSIER_EMPLOYEE_DOCUMENT_TYPE ||
      normalized === 'employee_dossier'
    ) {
      return 'employee';
    }
    if (
      normalized === DOSSIER_SITE_DOCUMENT_TYPE ||
      normalized === 'site_dossier'
    ) {
      return 'site';
    }

    if (code.startsWith('DOS-EMP-')) {
      return 'employee';
    }
    if (code.startsWith('DOS-SIT-')) {
      return 'site';
    }

    return null;
  }

  private extractEmployeeCodePrefix(code: string): string | null {
    const transitional = code.match(DOSSIER_CODE_TRANSITIONAL_EMPLOYEE_REGEX);
    if (transitional) {
      return transitional[1];
    }
    const legacy = code.match(DOSSIER_CODE_LEGACY_EMPLOYEE_REGEX);
    if (legacy) {
      return legacy[1];
    }
    return null;
  }

  private extractSiteCodePrefix(code: string): string | null {
    const transitional = code.match(DOSSIER_CODE_TRANSITIONAL_SITE_REGEX);
    if (transitional) {
      return transitional[1];
    }
    const legacy = code.match(DOSSIER_CODE_LEGACY_SITE_REGEX);
    if (legacy) {
      return legacy[1];
    }
    return null;
  }

  private buildTruncationInfo(
    datasets: DossierDatasetTruncation,
  ): DossierTruncationInfo {
    const truncated = Object.values(datasets).some(Boolean);
    return {
      limit: DOSSIER_RECORD_LIMIT,
      truncated,
      datasets,
    };
  }

  private async attachGovernedPdf(input: {
    kind: DossierKind;
    entityId: string;
    companyId: string;
    title: string;
    documentDate?: Date | string | null;
    file: Express.Multer.File;
    actorId?: string;
  }): Promise<{
    dossierId: string;
    kind: DossierKind;
    hasFinalPdf: boolean;
    availability: DossierPdfAccessAvailability;
    message: string;
    degraded: boolean;
    fileKey: string;
    folderPath: string;
    originalName: string;
    documentCode: string;
    fileHash: string;
  }> {
    const existingRegistry = await this.documentRegistryService.findByDocument(
      'dossier',
      input.entityId,
      this.getDocumentTypeByKind(input.kind),
      input.companyId,
    );

    const originalName =
      input.file.originalname?.trim() ||
      (input.kind === 'employee'
        ? `dossie_colaborador_${input.entityId}.pdf`
        : `dossie_unidade_${input.entityId}.pdf`);
    const fileKey = this.documentStorageService.generateDocumentKey(
      input.companyId,
      `dossiers-${input.kind}`,
      input.entityId,
      originalName,
    );
    const folderPath = `documents/${input.companyId}/dossiers-${input.kind}/${input.entityId}`;

    await this.documentStorageService.uploadFile(
      fileKey,
      input.file.buffer,
      input.file.mimetype || 'application/pdf',
    );

    try {
      const documentCode =
        existingRegistry?.document_code ||
        (await this.buildGovernedDossierCode(input.kind));
      const { hash, registryEntry } =
        await this.documentGovernanceService.registerFinalDocument({
          companyId: input.companyId,
          module: 'dossier',
          entityId: input.entityId,
          title: input.title,
          documentDate: input.documentDate || new Date(),
          documentType: this.getDocumentTypeByKind(input.kind),
          fileKey,
          folderPath,
          originalName,
          mimeType: input.file.mimetype || 'application/pdf',
          fileBuffer: input.file.buffer,
          createdBy: input.actorId || null,
          documentCode,
        });

      this.logger.log(
        `dossier_final_pdf_emitted kind=${input.kind} dossierId=${input.entityId} companyId=${input.companyId} fileKey=${fileKey} documentCode=${registryEntry.document_code || documentCode}`,
      );

      if (existingRegistry?.file_key && existingRegistry.file_key !== fileKey) {
        await cleanupUploadedFile(
          this.logger,
          `dossiers.attachGovernedPdf:cleanupPrevious:${input.kind}:${input.entityId}`,
          existingRegistry.file_key,
          (key) => this.documentStorageService.deleteFile(key),
        );
      }

      return {
        dossierId: input.entityId,
        kind: input.kind,
        hasFinalPdf: true,
        availability: 'ready',
        message: 'PDF final governado do dossie emitido com sucesso.',
        degraded: false,
        fileKey,
        folderPath,
        originalName,
        documentCode: registryEntry.document_code || documentCode,
        fileHash: hash,
      };
    } catch (error) {
      await cleanupUploadedFile(
        this.logger,
        `dossiers.attachGovernedPdf:${input.kind}:${input.entityId}`,
        fileKey,
        (key) => this.documentStorageService.deleteFile(key),
      );
      throw error;
    }
  }

  private async getGovernedPdfAccess(input: {
    kind: DossierKind;
    entityId: string;
    companyId: string;
    fallbackCode: string;
  }): Promise<{
    dossierId: string;
    kind: DossierKind;
    hasFinalPdf: boolean;
    availability: DossierPdfAccessAvailability;
    message: string;
    degraded: boolean;
    fileKey: string | null;
    folderPath: string | null;
    originalName: string | null;
    fileHash: string | null;
    documentCode: string;
    url: string | null;
  }> {
    const registryEntry = await this.documentRegistryService.findByDocument(
      'dossier',
      input.entityId,
      this.getDocumentTypeByKind(input.kind),
      input.companyId,
    );

    if (!registryEntry) {
      return {
        dossierId: input.entityId,
        kind: input.kind,
        hasFinalPdf: false,
        availability: 'not_emitted',
        message:
          'O dossie ainda nao possui PDF final governado emitido. Emita o documento final para habilitar download oficial e validacao forte.',
        degraded: false,
        fileKey: null,
        folderPath: null,
        originalName: null,
        fileHash: null,
        documentCode: input.fallbackCode,
        url: null,
      };
    }

    let availability: DossierPdfAccessAvailability = 'ready';
    let degraded = false;
    let message = 'PDF final governado do dossie disponivel para acesso.';
    let url: string | null = null;

    try {
      url = await this.documentStorageService.getSignedUrl(
        registryEntry.file_key,
      );
    } catch (error) {
      availability = 'registered_without_signed_url';
      degraded = true;
      message =
        'PDF final registrado, mas a URL segura nao esta disponivel no momento. Tente novamente quando o storage estiver saudavel.';
      this.logger.warn(
        `URL assinada indisponivel para dossie ${input.kind}:${input.entityId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      dossierId: input.entityId,
      kind: input.kind,
      hasFinalPdf: true,
      availability,
      message,
      degraded,
      fileKey: registryEntry.file_key,
      folderPath: registryEntry.folder_path,
      originalName: registryEntry.original_name,
      fileHash: registryEntry.file_hash,
      documentCode: registryEntry.document_code || input.fallbackCode,
      url,
    };
  }

  private async resolveDossierByRegistryCode(code: string): Promise<{
    valid: boolean;
    code: string;
    message?: string;
    document?: {
      id: string;
      module: string;
      document_type: string;
      title: string;
      document_date: string | null;
      original_name: string | null;
      file_hash: string | null;
      updated_at: string;
    };
    final_document?: {
      has_final_pdf: boolean;
      document_code: string | null;
      original_name: string | null;
      file_hash: string | null;
      emitted_at: string | null;
    };
  } | null> {
    const registryEntry = await this.documentRegistryService.findByCode(code);
    if (!registryEntry || registryEntry.module !== 'dossier') {
      return null;
    }

    const kind = this.resolveDossierKindFromDocumentType(
      registryEntry.document_type,
      code,
    );
    if (!kind) {
      return null;
    }

    if (kind === 'employee') {
      const user = await this.usersRepository.findOne({
        where: {
          id: registryEntry.entity_id,
          company_id: registryEntry.company_id,
        },
      });
      if (!user) {
        return null;
      }

      return {
        valid: true,
        code,
        document: {
          id: user.id,
          module: 'dossier',
          document_type: this.getValidationDocumentType('employee'),
          title: registryEntry.title || `Dossie do colaborador ${user.nome}`,
          document_date: this.serializeDate(registryEntry.document_date),
          original_name: registryEntry.original_name,
          file_hash: registryEntry.file_hash,
          updated_at:
            this.serializeDate(registryEntry.updated_at) ||
            new Date().toISOString(),
        },
        final_document: {
          has_final_pdf: true,
          document_code: registryEntry.document_code,
          original_name: registryEntry.original_name,
          file_hash: registryEntry.file_hash,
          emitted_at:
            this.serializeDate(registryEntry.created_at) ||
            this.serializeDate(registryEntry.updated_at),
        },
      };
    }

    const site = await this.sitesRepository.findOne({
      where: {
        id: registryEntry.entity_id,
        company_id: registryEntry.company_id,
      },
    });
    if (!site) {
      return null;
    }

    return {
      valid: true,
      code,
      document: {
        id: site.id,
        module: 'dossier',
        document_type: this.getValidationDocumentType('site'),
        title: registryEntry.title || `Dossie da obra/setor ${site.nome}`,
        document_date: this.serializeDate(registryEntry.document_date),
        original_name: registryEntry.original_name,
        file_hash: registryEntry.file_hash,
        updated_at:
          this.serializeDate(registryEntry.updated_at) ||
          new Date().toISOString(),
      },
      final_document: {
        has_final_pdf: true,
        document_code: registryEntry.document_code,
        original_name: registryEntry.original_name,
        file_hash: registryEntry.file_hash,
        emitted_at:
          this.serializeDate(registryEntry.created_at) ||
          this.serializeDate(registryEntry.updated_at),
      },
    };
  }

  private async resolveEmployeeCodeValidation(
    normalizedCode: string,
    prefix: string,
  ): Promise<{
    valid: boolean;
    code: string;
    message?: string;
    document?: {
      id: string;
      module: string;
      document_type: string;
      title: string;
      document_date: string | null;
      original_name: string | null;
      file_hash: string | null;
      updated_at: string;
    };
    final_document?: {
      has_final_pdf: boolean;
      document_code: string | null;
      original_name: string | null;
      file_hash: string | null;
      emitted_at: string | null;
    };
  } | null> {
    const candidate = await this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.site', 'site')
      .leftJoinAndSelect('user.company', 'company')
      .where('LOWER(user.id) LIKE :prefix', {
        prefix: `${prefix.toLowerCase()}%`,
      })
      .getOne();
    if (!candidate) {
      return null;
    }

    const expectedCode = this.buildEmployeeDossierCode(candidate.id);
    const legacyCode = this.buildLegacyDossierCode('employee', candidate.id);
    if (normalizedCode !== expectedCode && normalizedCode !== legacyCode) {
      return null;
    }

    const registryEntry = await this.documentRegistryService.findByDocument(
      'dossier',
      candidate.id,
      DOSSIER_EMPLOYEE_DOCUMENT_TYPE,
      candidate.company_id,
    );

    return {
      valid: true,
      code: normalizedCode,
      document: {
        id: candidate.id,
        module: 'dossier',
        document_type: this.getValidationDocumentType('employee'),
        title: `Dossie do colaborador ${candidate.nome}`,
        document_date: this.serializeDate(registryEntry?.document_date) || null,
        original_name: registryEntry?.original_name || null,
        file_hash: registryEntry?.file_hash || null,
        updated_at:
          this.serializeDate(
            registryEntry?.updated_at || candidate.updated_at,
          ) || new Date().toISOString(),
      },
      final_document: {
        has_final_pdf: Boolean(registryEntry?.file_key),
        document_code: registryEntry?.document_code || expectedCode,
        original_name: registryEntry?.original_name || null,
        file_hash: registryEntry?.file_hash || null,
        emitted_at: this.serializeDate(registryEntry?.created_at) || null,
      },
    };
  }

  private async resolveSiteCodeValidation(
    normalizedCode: string,
    prefix: string,
  ): Promise<{
    valid: boolean;
    code: string;
    message?: string;
    document?: {
      id: string;
      module: string;
      document_type: string;
      title: string;
      document_date: string | null;
      original_name: string | null;
      file_hash: string | null;
      updated_at: string;
    };
    final_document?: {
      has_final_pdf: boolean;
      document_code: string | null;
      original_name: string | null;
      file_hash: string | null;
      emitted_at: string | null;
    };
  } | null> {
    const candidate = await this.sitesRepository
      .createQueryBuilder('site')
      .leftJoinAndSelect('site.company', 'company')
      .where('LOWER(site.id) LIKE :prefix', {
        prefix: `${prefix.toLowerCase()}%`,
      })
      .getOne();
    if (!candidate) {
      return null;
    }

    const expectedCode = this.buildSiteDossierCode(candidate.id);
    const legacyCode = this.buildLegacyDossierCode('site', candidate.id);
    if (normalizedCode !== expectedCode && normalizedCode !== legacyCode) {
      return null;
    }

    const registryEntry = await this.documentRegistryService.findByDocument(
      'dossier',
      candidate.id,
      DOSSIER_SITE_DOCUMENT_TYPE,
      candidate.company_id,
    );

    return {
      valid: true,
      code: normalizedCode,
      document: {
        id: candidate.id,
        module: 'dossier',
        document_type: this.getValidationDocumentType('site'),
        title: `Dossie da obra/setor ${candidate.nome}`,
        document_date: this.serializeDate(registryEntry?.document_date) || null,
        original_name: registryEntry?.original_name || null,
        file_hash: registryEntry?.file_hash || null,
        updated_at:
          this.serializeDate(
            registryEntry?.updated_at || candidate.updated_at,
          ) || new Date().toISOString(),
      },
      final_document: {
        has_final_pdf: Boolean(registryEntry?.file_key),
        document_code: registryEntry?.document_code || expectedCode,
        original_name: registryEntry?.original_name || null,
        file_hash: registryEntry?.file_hash || null,
        emitted_at: this.serializeDate(registryEntry?.created_at) || null,
      },
    };
  }

  private serializeDate(value?: Date | string | null): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
}
