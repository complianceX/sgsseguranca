import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Rdo } from './entities/rdo.entity';
import { CreateRdoDto } from './dto/create-rdo.dto';
import { UpdateRdoDto } from './dto/update-rdo.dto';
import { TenantService } from '../common/tenant/tenant.service';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import { MailService } from '../mail/mail.service';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import { DocumentRegistryService } from '../document-registry/document-registry.service';
import { cleanupUploadedFile } from '../common/storage/storage-compensation.util';
import { WeeklyBundleFilters } from '../common/services/document-bundle.service';

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  rascunho: ['enviado'],
  enviado: ['aprovado', 'rascunho'],
  aprovado: [],
};

const CLIMA_LABEL: Record<string, string> = {
  ensolarado: 'Ensolarado ☀️',
  nublado: 'Nublado ☁️',
  chuvoso: 'Chuvoso 🌧️',
  parcialmente_nublado: 'Parcialmente Nublado 🌤️',
};

@Injectable()
export class RdosService {
  private readonly logger = new Logger(RdosService.name);

  constructor(
    @InjectRepository(Rdo)
    private rdosRepository: Repository<Rdo>,
    private tenantService: TenantService,
    private mailService: MailService,
    private documentStorageService: DocumentStorageService,
    private documentGovernanceService: DocumentGovernanceService,
    private documentRegistryService: DocumentRegistryService,
  ) {}

  private async generateNumero(companyId: string): Promise<string> {
    const now = new Date();
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `RDO-${yyyymm}-`;
    const last = await this.rdosRepository
      .createQueryBuilder('rdo')
      .select('MAX(rdo.numero)', 'max')
      .where('rdo.company_id = :companyId', { companyId })
      .andWhere('rdo.numero LIKE :prefix', { prefix: `${prefix}%` })
      .getRawOne<{ max: string | null }>();
    const lastSeq = last?.max ? Number(last.max.slice(prefix.length)) || 0 : 0;
    return `${prefix}${String(lastSeq + 1).padStart(3, '0')}`;
  }

  async create(createRdoDto: CreateRdoDto): Promise<Rdo> {
    const companyId =
      createRdoDto.company_id ?? this.tenantService.getTenantId();
    const numero = await this.generateNumero(companyId!);
    const rdo = this.rdosRepository.create({
      ...createRdoDto,
      company_id: companyId,
      numero,
    });
    return this.rdosRepository.save(rdo);
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    site_id?: string;
    status?: string;
    data_inicio?: string;
    data_fim?: string;
  }): Promise<OffsetPage<Rdo>> {
    const tenantId = this.tenantService.getTenantId();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.rdosRepository
      .createQueryBuilder('rdo')
      .leftJoinAndSelect('rdo.site', 'site')
      .leftJoinAndSelect('rdo.responsavel', 'responsavel')
      .orderBy('rdo.data', 'DESC')
      .addOrderBy('rdo.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (tenantId) {
      qb.andWhere('rdo.company_id = :tenantId', { tenantId });
    }
    if (opts?.site_id) {
      qb.andWhere('rdo.site_id = :siteId', { siteId: opts.site_id });
    }
    if (opts?.status) {
      qb.andWhere('rdo.status = :status', { status: opts.status });
    }
    if (opts?.data_inicio) {
      qb.andWhere('rdo.data >= :dataInicio', { dataInicio: opts.data_inicio });
    }
    if (opts?.data_fim) {
      qb.andWhere('rdo.data <= :dataFim', { dataFim: opts.data_fim });
    }

    const [data, total] = await qb.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  async findOne(id: string): Promise<Rdo> {
    const tenantId = this.tenantService.getTenantId();
    const rdo = await this.rdosRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
      relations: ['site', 'responsavel', 'company'],
    });
    if (!rdo) {
      throw new NotFoundException(`RDO com ID ${id} não encontrado`);
    }
    return rdo;
  }

  async update(id: string, updateRdoDto: UpdateRdoDto): Promise<Rdo> {
    const rdo = await this.findOne(id);
    await this.assertRdoDocumentMutable(rdo);
    if ('status' in updateRdoDto && updateRdoDto.status !== undefined) {
      throw new BadRequestException(
        'Use PATCH /rdos/:id/status para alterar o status do RDO.',
      );
    }
    Object.assign(rdo, updateRdoDto);
    return this.rdosRepository.save(rdo);
  }

  async updateStatus(id: string, newStatus: string): Promise<Rdo> {
    const rdo = await this.findOne(id);
    await this.assertRdoDocumentMutable(rdo);
    const allowed = ALLOWED_STATUS_TRANSITIONS[rdo.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Transição de "${rdo.status}" para "${newStatus}" não permitida`,
      );
    }
    if (newStatus === 'aprovado') {
      this.assertRdoReadyForFinalDocument(rdo);
    }
    rdo.status = newStatus;
    return this.rdosRepository.save(rdo);
  }

  async sign(
    id: string,
    body: {
      tipo: 'responsavel' | 'engenheiro';
      nome: string;
      cpf: string;
      hash: string;
      timestamp: string;
    },
  ): Promise<Rdo> {
    const rdo = await this.findOne(id);
    await this.assertRdoDocumentMutable(rdo);
    const sigData = JSON.stringify({
      nome: body.nome,
      cpf: body.cpf,
      hash: body.hash,
      timestamp: body.timestamp,
      signed_at: new Date().toISOString(),
    });
    if (body.tipo === 'responsavel') {
      rdo.assinatura_responsavel = sigData;
    } else {
      rdo.assinatura_engenheiro = sigData;
    }
    return this.rdosRepository.save(rdo);
  }

  async markPdfSaved(id: string, body: { filename: string }): Promise<Rdo> {
    const rdo = await this.findOne(id);
    await this.assertRdoDocumentMutable(rdo);
    this.assertRdoReadyForFinalDocument(rdo);
    rdo.pdf_file_key = `rdos/${id}/${body.filename}`;
    rdo.pdf_folder_path = `rdos/${id}`;
    rdo.pdf_original_name = body.filename;
    const saved = await this.rdosRepository.save(rdo);

    await this.documentGovernanceService.syncFinalDocumentMetadata({
      companyId: rdo.company_id,
      module: 'rdo',
      entityId: rdo.id,
      title: this.buildRdoTitle(rdo),
      documentDate: this.getRdoDocumentDate(rdo),
      documentCode: this.buildValidationCode(rdo),
      fileKey: saved.pdf_file_key!,
      folderPath: saved.pdf_folder_path,
      originalName: saved.pdf_original_name,
      mimeType: 'application/pdf',
    });

    return saved;
  }

  async savePdf(
    id: string,
    file: Express.Multer.File,
  ): Promise<{ fileKey: string; folderPath: string; originalName: string }> {
    const rdo = await this.findOne(id);
    await this.assertRdoDocumentMutable(rdo);
    this.assertRdoReadyForFinalDocument(rdo);

    const documentDate = this.getRdoDocumentDate(rdo);
    const year = documentDate.getFullYear();
    const weekNumber = String(this.getIsoWeekNumber(documentDate)).padStart(
      2,
      '0',
    );
    const folderPath = `rdos/${rdo.company_id}/${year}/week-${weekNumber}`;
    const originalName =
      file.originalname?.trim() || `${rdo.numero || `rdo-${rdo.id}`}.pdf`;
    const fileKey = this.documentStorageService.generateDocumentKey(
      rdo.company_id,
      `rdos/${year}/week-${weekNumber}`,
      rdo.id,
      originalName,
    );

    await this.documentStorageService.uploadFile(
      fileKey,
      file.buffer,
      file.mimetype,
    );

    try {
      await this.documentGovernanceService.registerFinalDocument({
        companyId: rdo.company_id,
        module: 'rdo',
        entityId: rdo.id,
        title: this.buildRdoTitle(rdo),
        documentDate,
        documentCode: this.buildValidationCode(rdo),
        fileKey,
        folderPath,
        originalName,
        mimeType: file.mimetype,
        fileBuffer: file.buffer,
        persistEntityMetadata: async (manager) => {
          await manager.getRepository(Rdo).update(
            { id: rdo.id },
            {
              pdf_file_key: fileKey,
              pdf_folder_path: folderPath,
              pdf_original_name: originalName,
            },
          );
        },
      });
    } catch (error) {
      await cleanupUploadedFile(this.logger, `rdo:${rdo.id}`, fileKey, (key) =>
        this.documentStorageService.deleteFile(key),
      );
      throw error;
    }

    return {
      fileKey,
      folderPath,
      originalName,
    };
  }

  async getPdfAccess(id: string): Promise<{
    entityId: string;
    fileKey: string;
    folderPath: string;
    originalName: string;
    url: string | null;
  }> {
    const rdo = await this.findOne(id);
    const registryEntry = await this.documentRegistryService.findByDocument(
      'rdo',
      rdo.id,
      'pdf',
      rdo.company_id,
    );

    if (!registryEntry) {
      throw new NotFoundException(`RDO ${id} não possui PDF final armazenado`);
    }

    let url: string | null = null;
    try {
      url = await this.documentStorageService.getSignedUrl(
        registryEntry.file_key,
        3600,
      );
    } catch {
      url = null;
    }

    return {
      entityId: rdo.id,
      fileKey: registryEntry.file_key,
      folderPath: registryEntry.folder_path || '',
      originalName:
        registryEntry.original_name ||
        registryEntry.file_key.split('/').pop() ||
        'rdo.pdf',
      url,
    };
  }

  async sendEmail(id: string, to: string[]): Promise<void> {
    const rdo = await this.findOne(id);
    if (!to.length) {
      return;
    }
    const dataFormatada = new Date(rdo.data).toLocaleDateString('pt-BR');
    const totalTrab = (rdo.mao_de_obra ?? []).reduce(
      (s, m) => s + (m.quantidade ?? 0),
      0,
    );
    const totalEquip = (rdo.equipamentos ?? []).length;
    const totalServicos = (rdo.servicos_executados ?? []).length;
    const totalOcorrencias = (rdo.ocorrencias ?? []).length;

    const climaManha = rdo.clima_manha
      ? (CLIMA_LABEL[rdo.clima_manha] ?? rdo.clima_manha)
      : '-';
    const climaTarde = rdo.clima_tarde
      ? (CLIMA_LABEL[rdo.clima_tarde] ?? rdo.clima_tarde)
      : '-';
    const registryEntry = await this.documentRegistryService.findByDocument(
      'rdo',
      rdo.id,
      'pdf',
      rdo.company_id,
    );
    const subject = `RDO ${rdo.numero} — ${dataFormatada}${rdo.site?.nome ? ` · ${rdo.site.nome}` : ''}`;
    const text = `RDO ${rdo.numero} de ${dataFormatada}.`;

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:0;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#1e6b43,#0c2e1a);padding:28px 32px;color:white;">
          <div style="font-size:11px;letter-spacing:0.1em;opacity:0.7;text-transform:uppercase;margin-bottom:4px;">GST — Gestão de Segurança do Trabalho</div>
          <h1 style="margin:0;font-size:22px;font-weight:700;">Relatório Diário de Obra</h1>
          <div style="font-size:15px;opacity:0.85;margin-top:4px;">${rdo.numero} &nbsp;·&nbsp; ${dataFormatada}</div>
        </div>
        <div style="padding:28px 32px;background:#fff;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:8px 0;color:#6b7280;">Obra/Setor</td><td style="padding:8px 0;font-weight:600;color:#111827;">${rdo.site?.nome ?? '-'}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Responsável</td><td style="padding:8px 0;font-weight:600;color:#111827;">${rdo.responsavel?.nome ?? '-'}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Status</td><td style="padding:8px 0;"><span style="background:#dcfce7;color:#166534;padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:600;">${rdo.status.toUpperCase()}</span></td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Clima manhã</td><td style="padding:8px 0;color:#111827;">${climaManha}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Clima tarde</td><td style="padding:8px 0;color:#111827;">${climaTarde}</td></tr>
            ${rdo.temperatura_min != null ? `<tr><td style="padding:8px 0;color:#6b7280;">Temperatura</td><td style="padding:8px 0;color:#111827;">${rdo.temperatura_min}°C — ${rdo.temperatura_max}°C</td></tr>` : ''}
          </table>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0;"/>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="background:#f0fdf4;border-radius:8px;padding:14px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#166534;">${totalTrab}</div>
              <div style="font-size:12px;color:#4b7a5c;">Trabalhadores</div>
            </div>
            <div style="background:#eff6ff;border-radius:8px;padding:14px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#1d4ed8;">${totalServicos}</div>
              <div style="font-size:12px;color:#3b5ec4;">Serviços exec.</div>
            </div>
            <div style="background:#fefce8;border-radius:8px;padding:14px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#854d0e;">${totalEquip}</div>
              <div style="font-size:12px;color:#a16207;">Equipamentos</div>
            </div>
            <div style="background:#fdf4ff;border-radius:8px;padding:14px;text-align:center;">
              <div style="font-size:24px;font-weight:700;color:#7e22ce;">${totalOcorrencias}</div>
              <div style="font-size:12px;color:#6b21a8;">Ocorrências</div>
            </div>
          </div>
          ${rdo.houve_acidente ? '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-top:16px;color:#991b1b;font-weight:600;">⚠️ Acidente registrado neste RDO</div>' : ''}
          ${rdo.houve_paralisacao ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-top:12px;color:#92400e;font-weight:600;">⏸️ Paralisação: ${rdo.motivo_paralisacao ?? 'sem motivo informado'}</div>` : ''}
          ${rdo.observacoes ? `<div style="margin-top:16px;"><div style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Observações</div><div style="font-size:14px;color:#374151;line-height:1.6;">${rdo.observacoes}</div></div>` : ''}
        </div>
        <div style="padding:16px 32px;background:#f8fafc;text-align:center;font-size:11px;color:#9ca3af;">
          GST — Gestão de Segurança do Trabalho · Enviado automaticamente
        </div>
      </div>
    `;

    if (registryEntry?.file_key) {
      const pdfBuffer = await this.documentStorageService.downloadFileBuffer(
        registryEntry.file_key,
      );
      const attachmentFilename =
        registryEntry.original_name || `${rdo.numero || rdo.id}.pdf`;

      for (const email of to) {
        await this.mailService.sendMailSimple(
          email,
          subject,
          `${text} O PDF final governado segue em anexo.`,
          { companyId: rdo.company_id },
          [
            {
              filename: attachmentFilename,
              content: pdfBuffer,
              contentType: 'application/pdf',
            },
          ],
          {
            html,
            filename: attachmentFilename,
          },
        );
      }
      return;
    }

    for (const email of to) {
      await this.mailService.sendMail(
        email,
        subject,
        `${text} Acesse o sistema para visualizar o documento completo.`,
        html,
        { companyId: rdo.company_id },
      );
    }
  }

  async listFiles(filters: WeeklyBundleFilters = {}) {
    return this.documentGovernanceService.listFinalDocuments('rdo', filters);
  }

  async getWeeklyBundle(filters: WeeklyBundleFilters) {
    return this.documentGovernanceService.getModuleWeeklyBundle(
      'rdo',
      'RDO',
      filters,
    );
  }

  async remove(id: string): Promise<void> {
    const rdo = await this.findOne(id);
    await this.documentGovernanceService.removeFinalDocumentReference({
      companyId: rdo.company_id,
      module: 'rdo',
      entityId: rdo.id,
      removeEntityState: async (manager) => {
        await manager.getRepository(Rdo).update(
          { id: rdo.id },
          {
            pdf_file_key: null as unknown as string,
            pdf_folder_path: null as unknown as string,
            pdf_original_name: null as unknown as string,
          },
        );
      },
      cleanupStoredFile: (fileKey) =>
        this.documentStorageService.deleteFile(fileKey),
    });
    await this.rdosRepository.remove(rdo);
  }

  async exportExcel(): Promise<Buffer> {
    const tenantId = this.tenantService.getTenantId();
    const qb = this.rdosRepository
      .createQueryBuilder('rdo')
      .leftJoinAndSelect('rdo.site', 'site')
      .leftJoinAndSelect('rdo.responsavel', 'responsavel')
      .orderBy('rdo.data', 'DESC');

    if (tenantId) {
      qb.where('rdo.company_id = :tenantId', { tenantId });
    }

    const rdos = await qb.getMany();

    const rows = rdos.map((r) => {
      const totalTrab = (r.mao_de_obra ?? []).reduce(
        (s, m) => s + (m.quantidade ?? 0),
        0,
      );
      return {
        Número: r.numero,
        Data: new Date(r.data).toLocaleDateString('pt-BR'),
        'Obra/Setor': r.site?.nome ?? '',
        Responsável: r.responsavel?.nome ?? '',
        Status: r.status,
        'Total Trabalhadores': totalTrab,
        Equipamentos: (r.equipamentos ?? []).length,
        Materiais: (r.materiais_recebidos ?? []).length,
        'Serviços Exec.': (r.servicos_executados ?? []).length,
        Ocorrências: (r.ocorrencias ?? []).length,
        'Clima Manhã': r.clima_manha
          ? (CLIMA_LABEL[r.clima_manha] ?? r.clima_manha)
          : '',
        'Clima Tarde': r.clima_tarde
          ? (CLIMA_LABEL[r.clima_tarde] ?? r.clima_tarde)
          : '',
        'Temp. Mín (°C)': r.temperatura_min ?? '',
        'Temp. Máx (°C)': r.temperatura_max ?? '',
        'Condição Terreno': r.condicao_terreno ?? '',
        'Houve Acidente': r.houve_acidente ? 'Sim' : 'Não',
        'Houve Paralisação': r.houve_paralisacao ? 'Sim' : 'Não',
        'Motivo Paralisação': r.motivo_paralisacao ?? '',
        'Tem PDF': r.pdf_file_key ? 'Sim' : 'Não',
        'Assinado Responsável': r.assinatura_responsavel ? 'Sim' : 'Não',
        'Assinado Engenheiro': r.assinatura_engenheiro ? 'Sim' : 'Não',
        Observações: r.observacoes ?? '',
        'Programa Amanhã': r.programa_servicos_amanha ?? '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RDOs');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  private getRdoDocumentDate(rdo: Pick<Rdo, 'data' | 'created_at'>): Date {
    const dateValue = rdo.data as Date | string | null | undefined;

    if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
      const looksLikeDateColumn =
        dateValue.getUTCHours() === 0 &&
        dateValue.getUTCMinutes() === 0 &&
        dateValue.getUTCSeconds() === 0 &&
        dateValue.getUTCMilliseconds() === 0;

      if (looksLikeDateColumn) {
        return new Date(
          dateValue.getUTCFullYear(),
          dateValue.getUTCMonth(),
          dateValue.getUTCDate(),
        );
      }

      return new Date(dateValue.getTime());
    }

    if (typeof dateValue === 'string') {
      const dateOnlyMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateOnlyMatch) {
        const [, year, month, day] = dateOnlyMatch;
        return new Date(Number(year), Number(month) - 1, Number(day));
      }

      const parsed = new Date(dateValue);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    const createdAt = new Date(rdo.created_at);
    return Number.isNaN(createdAt.getTime()) ? new Date() : createdAt;
  }

  private buildRdoTitle(
    rdo: Pick<Rdo, 'numero'> & { site?: { nome?: string } | null },
  ): string {
    return rdo.site?.nome ? `${rdo.numero} - ${rdo.site.nome}` : rdo.numero;
  }

  private buildValidationCode(rdo: Pick<Rdo, 'id' | 'data' | 'created_at'>) {
    const documentDate = this.getRdoDocumentDate(rdo);
    return `RDO-${this.getIsoYear(documentDate)}-${String(
      this.getIsoWeekNumber(documentDate),
    ).padStart(2, '0')}-${rdo.id.slice(0, 8).toUpperCase()}`;
  }

  private getIsoYear(date: Date): number {
    const target = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
    return target.getUTCFullYear();
  }

  private getIsoWeekNumber(date: Date): number {
    const target = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    );
    target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    return Math.ceil(
      ((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    );
  }

  private assertRdoReadyForFinalDocument(
    rdo: Pick<
      Rdo,
      'status' | 'assinatura_responsavel' | 'assinatura_engenheiro'
    >,
  ) {
    if (rdo.status !== 'aprovado') {
      throw new BadRequestException(
        'Somente RDO aprovado pode receber PDF final governado.',
      );
    }

    if (!rdo.assinatura_responsavel || !rdo.assinatura_engenheiro) {
      throw new BadRequestException(
        'Assinaturas do responsável e do engenheiro são obrigatórias antes da emissão final do RDO.',
      );
    }
  }

  private async assertRdoDocumentMutable(
    rdo: Pick<Rdo, 'id' | 'company_id'>,
  ): Promise<void> {
    const registryEntry = await this.documentRegistryService.findByDocument(
      'rdo',
      rdo.id,
      'pdf',
      rdo.company_id,
    );

    if (registryEntry) {
      throw new BadRequestException(
        'RDO com PDF final emitido está bloqueado para edição. Gere um novo documento para alterar o conteúdo.',
      );
    }
  }
}
