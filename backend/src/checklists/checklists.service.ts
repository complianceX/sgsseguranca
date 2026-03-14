import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
  Scope,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, FindOptionsSelect } from 'typeorm';
import { plainToClass } from 'class-transformer';
import { Checklist } from './entities/checklist.entity';
import { ChecklistResponseDto } from './dto/checklist-response.dto';
import { TenantService } from '../common/tenant/tenant.service';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { MailService } from '../mail/mail.service';
import { SignaturesService } from '../signatures/signatures.service';
import { StorageService } from '../common/services/storage.service';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { UsersService } from '../users/users.service';
import { SitesService } from '../sites/sites.service';
import {
  applyBackendPdfFooter,
  backendPdfTheme,
  createBackendPdfTableTheme,
  drawBackendPdfHeader,
  drawBackendSectionTitle,
  getBackendLastTableY,
} from '../common/services/pdf-branding';

import { NotificationsGateway } from '../notifications/notifications.gateway';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';
import {
  DocumentBundleService,
  WeeklyBundleFilters,
} from '../common/services/document-bundle.service';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import { RequestContext } from '../common/middleware/request-context.middleware';

@Injectable({ scope: Scope.REQUEST })
export class ChecklistsService {
  private readonly logger = new Logger(ChecklistsService.name);
  private readonly checklistTemplatesByActivity = [
    {
      titulo: 'Checklist - Trabalho em Altura',
      descricao: 'Inspeção pré-tarefa para serviços em altura.',
      categoria: 'Atividade Crítica',
      periodicidade: 'Por tarefa',
      nivel_risco_padrao: 'Alto',
      itens: [
        {
          item: 'Linha de vida inspecionada e liberada',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
        {
          item: 'Cinto paraquedista em bom estado',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
        {
          item: 'Ancoragem definida e sinalizada',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
        {
          item: 'Permissão de trabalho emitida',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
      ],
    },
    {
      titulo: 'Checklist - Eletricidade',
      descricao:
        'Verificação pré-serviço para atividades com energia elétrica.',
      categoria: 'Atividade Crítica',
      periodicidade: 'Por tarefa',
      nivel_risco_padrao: 'Alto',
      itens: [
        {
          item: 'Bloqueio e etiquetagem aplicados',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
        {
          item: 'Ausência de tensão confirmada',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
        {
          item: 'Ferramentas isoladas inspecionadas',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
        {
          item: 'Equipe com treinamento NR-10 válido',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
      ],
    },
    {
      titulo: 'Checklist - Escavação',
      descricao: 'Inspeção para abertura e trabalho em valas/escavações.',
      categoria: 'Atividade Crítica',
      periodicidade: 'Por turno',
      nivel_risco_padrao: 'Alto',
      itens: [
        {
          item: 'Talude ou escoramento conforme projeto',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
        {
          item: 'Acesso seguro à escavação disponível',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
        {
          item: 'Interferências subterrâneas verificadas',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
        {
          item: 'Área isolada e sinalizada',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
      ],
    },
    {
      titulo: 'Checklist - Içamento de Carga',
      descricao: 'Conferência antes de içamentos e movimentações críticas.',
      categoria: 'Movimentação de carga',
      periodicidade: 'Por tarefa',
      nivel_risco_padrao: 'Alto',
      itens: [
        {
          item: 'Plano de içamento disponível',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
        {
          item: 'Acessórios inspecionados e identificados',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
        {
          item: 'Sinaleiro definido',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
        {
          item: 'Área de giro isolada',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
      ],
    },
    {
      titulo: 'Checklist - Espaço Confinado',
      descricao: 'Verificação para entrada em espaço confinado.',
      categoria: 'Atividade Crítica',
      periodicidade: 'Por entrada',
      nivel_risco_padrao: 'Crítico',
      itens: [
        {
          item: 'Medição atmosférica realizada',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
        {
          item: 'Vigia designado',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
        {
          item: 'Resgate definido e disponível',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
        {
          item: 'Permissão de entrada liberada',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
      ],
    },
    {
      titulo: 'Checklist - Máquinas e Equipamentos',
      descricao: 'Inspeção rápida de condição segura de máquinas.',
      categoria: 'Equipamento',
      periodicidade: 'Diário',
      nivel_risco_padrao: 'Médio',
      itens: [
        {
          item: 'Proteções fixas e móveis instaladas',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
        {
          item: 'Botão de emergência testado',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
        {
          item: 'Sem vazamentos aparentes',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
        {
          item: 'Checklist diário preenchido pelo operador',
          tipo_resposta: 'sim_nao_na',
          obrigatorio: true,
        },
      ],
    },
  ];

  constructor(
    @InjectRepository(Checklist)
    private checklistsRepository: Repository<Checklist>,
    private tenantService: TenantService,
    private dataSource: DataSource,
    @Inject(forwardRef(() => MailService))
    private mailService: MailService,
    private signaturesService: SignaturesService,
    private notificationsGateway: NotificationsGateway,
    private storageService: StorageService,
    private usersService: UsersService,
    private sitesService: SitesService,
    private readonly documentBundleService: DocumentBundleService,
    private readonly documentGovernanceService: DocumentGovernanceService,
  ) {}

  private readonly checklistListSelect: FindOptionsSelect<Checklist> = {
    id: true,
    titulo: true,
    descricao: true,
    equipamento: true,
    maquina: true,
    data: true,
    status: true,
    company_id: true,
    site_id: true,
    inspetor_id: true,
    is_modelo: true,
    created_at: true,
    updated_at: true,
  };

  async create(
    createChecklistDto: CreateChecklistDto,
  ): Promise<ChecklistResponseDto> {
    const tenantId = this.tenantService.getTenantId();
    this.logger.log(`Criando checklist para empresa: ${tenantId}`);

    const checklist = this.checklistsRepository.create({
      ...createChecklistDto,
      company_id: tenantId || createChecklistDto.company_id,
    });
    const saved = await this.checklistsRepository.save(checklist);
    this.logger.log(`Checklist salvo: ${saved.id}`);
    return plainToClass(ChecklistResponseDto, saved);
  }

  async findAll(options?: {
    onlyTemplates?: boolean;
    excludeTemplates?: boolean;
  }): Promise<ChecklistResponseDto[]> {
    const tenantId = this.tenantService.getTenantId();
    this.logger.debug(`Buscando checklists para empresa: ${tenantId}`);

    const filter: { company_id?: string; is_modelo?: boolean } = {};
    if (tenantId) {
      filter.company_id = tenantId;
    }
    if (options?.onlyTemplates) {
      filter.is_modelo = true;
    } else if (options?.excludeTemplates) {
      filter.is_modelo = false;
    }

    const results = await this.checklistsRepository.find({
      where: filter,
      relations: ['site', 'inspetor'],
      order: { created_at: 'DESC' },
    });
    return results.map((c) => plainToClass(ChecklistResponseDto, c));
  }

  async findPaginated(options?: {
    onlyTemplates?: boolean;
    excludeTemplates?: boolean;
    page?: number;
    limit?: number;
  }): Promise<OffsetPage<ChecklistResponseDto>> {
    const tenantId = this.tenantService.getTenantId();
    this.logger.debug(
      `Buscando checklists paginados para empresa: ${tenantId}`,
    );

    const filter: { company_id?: string; is_modelo?: boolean } = {};
    if (tenantId) {
      filter.company_id = tenantId;
    }
    if (options?.onlyTemplates) {
      filter.is_modelo = true;
    } else if (options?.excludeTemplates) {
      filter.is_modelo = false;
    }

    const { page, limit, skip } = normalizeOffsetPagination(
      { page: options?.page, limit: options?.limit },
      { defaultLimit: 20, maxLimit: 100 },
    );

    const [rows, total] = await this.checklistsRepository.findAndCount({
      where: filter,
      // LISTING: evitar relations pesadas no endpoint de listagem.
      select: this.checklistListSelect,
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    const data = rows.map((c) => plainToClass(ChecklistResponseDto, c));
    return toOffsetPage(data, total, page, limit);
  }

  async findOne(id: string): Promise<ChecklistResponseDto> {
    const checklist = await this.findOneEntity(id);
    return plainToClass(ChecklistResponseDto, checklist);
  }

  async findOneEntity(id: string): Promise<Checklist> {
    const tenantId = this.tenantService.getTenantId();
    const checklist = await this.checklistsRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
      relations: ['site', 'inspetor'],
    });
    if (!checklist) {
      throw new NotFoundException(`Checklist com ID ${id} não encontrado`);
    }
    return checklist;
  }

  async update(
    id: string,
    updateChecklistDto: UpdateChecklistDto,
  ): Promise<ChecklistResponseDto> {
    const checklist = await this.findOneEntity(id);
    Object.assign(checklist, updateChecklistDto);
    const saved = await this.checklistsRepository.save(checklist);

    try {
      this.notificationsGateway.sendToCompany(
        checklist.company_id,
        'checklist:updated',
        { id: checklist.id },
      );
    } catch (e) {
      this.logger.error(
        'Falha ao enviar notificação de checklist atualizado',
        e,
      );
    }

    return plainToClass(ChecklistResponseDto, saved);
  }

  async remove(id: string): Promise<void> {
    const checklist = await this.findOneEntity(id);
    await this.documentGovernanceService.removeFinalDocumentReference({
      companyId: checklist.company_id,
      module: 'checklist',
      entityId: checklist.id,
      removeEntityState: async (manager) => {
        await manager.getRepository(Checklist).remove(checklist);
      },
    });
  }

  async sendEmail(id: string, to: string) {
    // CORREÇÃO: `sendMailWithAttachment` não existe. Usando `sendMailSimple` que aceita anexos.
    const checklist = await this.findOneEntity(id);
    const pdfBuffer = await this.generatePdf(checklist);

    await this.mailService.sendMailSimple(
      to,
      `Checklist: ${checklist.titulo}`,
      `Segue em anexo o checklist "${checklist.titulo}" realizado em ${new Date(checklist.data).toLocaleDateString('pt-BR')}.`,
      { companyId: checklist.company_id },
      [
        {
          filename: `checklist-${id}.pdf`,
          content: pdfBuffer,
        },
      ],
    );

    return { success: true };
  }

  async generatePdf(checklist: Checklist): Promise<Buffer> {
    // ALERTA DE PERFORMANCE: A geração de PDFs é uma tarefa síncrona e intensiva em CPU.
    // Em um ambiente com alta concorrência, isso pode bloquear o event loop do Node.js
    // e degradar a performance da aplicação.
    // RECOMENDAÇÃO: Mover esta lógica para um job em background (ex: usando BullMQ)
    // para não impactar a responsividade da API.
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const tableTheme = createBackendPdfTableTheme();
    drawBackendPdfHeader(doc, {
      title: 'CHECKLIST SST',
      subtitle: checklist.titulo,
      metaRight: [
        `Data: ${new Date(checklist.data).toLocaleDateString('pt-BR')}`,
        `Status: ${checklist.status || 'Pendente'}`,
      ],
    });

    doc.setFontSize(10);
    doc.setTextColor(...backendPdfTheme.text);
    doc.text(
      `Data: ${new Date(checklist.data).toLocaleDateString('pt-BR')}`,
      16,
      41,
    );
    doc.text(`Inspetor: ${checklist.inspetor?.nome || 'N/A'}`, 16, 47);
    doc.text(`Obra/Setor: ${checklist.site?.nome || 'N/A'}`, 16, 53);
    if (checklist.equipamento)
      doc.text(`Equipamento: ${checklist.equipamento}`, 16, 59);
    if (checklist.maquina) doc.text(`Máquina: ${checklist.maquina}`, 16, 65);

    interface ChecklistItem {
      item: string;
      status: string | boolean;
      observacao?: string;
    }
    const tableData = ((checklist.itens as ChecklistItem[]) || []).map(
      (item) => [
        item.item,
        item.status === 'ok' || item.status === 'sim'
          ? 'Conforme'
          : item.status === 'nok' || item.status === 'nao'
            ? 'Não Conforme'
            : 'N/A',
        item.observacao || '',
      ],
    );

    let currentY = 74;
    if (checklist.foto_equipamento) {
      try {
        const imgData =
          checklist.foto_equipamento.split(',')[1] ||
          checklist.foto_equipamento;
        drawBackendSectionTitle(doc, currentY - 10, 'Evidência do equipamento');
        doc.setFillColor(...backendPdfTheme.surface);
        doc.setDrawColor(...backendPdfTheme.border);
        doc.roundedRect(16, currentY - 4, 64, 64, 2, 2, 'FD');
        doc.addImage(imgData, 'PNG', 18, currentY - 2, 60, 60);
        currentY += 70;
      } catch (e) {
        this.logger.error('Erro ao adicionar imagem do equipamento:', e);
      }
    }

    autoTable(doc, {
      startY: currentY,
      head: [['Item', 'Status', 'Observação']],
      body: tableData,
      ...tableTheme,
      styles: {
        ...tableTheme.styles,
        fontSize: 9,
        cellPadding: 2.5,
      },
    });

    const signatures = await this.signaturesService.findByDocument(
      checklist.id,
      'CHECKLIST',
    );
    if (signatures.length > 0) {
      const finalY = getBackendLastTableY(doc, 150);
      let currentSigY = finalY + 20;

      if (currentSigY > 250) {
        doc.addPage();
        currentSigY = 20;
      }
      drawBackendSectionTitle(doc, currentSigY - 4, 'Assinaturas');
      doc.setFontSize(12);
      doc.setTextColor(...backendPdfTheme.text);
      doc.text('Assinaturas', 16, currentSigY + 2);
      currentSigY += 10;

      for (const sig of signatures) {
        if (currentSigY + 40 > 280) {
          doc.addPage();
          currentSigY = 20;
        }
        doc.setFontSize(10);
        doc.text(
          `Assinado por: ${sig.user?.nome || 'Usuário'} em ${new Date(sig.created_at).toLocaleString('pt-BR')}`,
          16,
          currentSigY,
        );
        currentSigY += 5;
        if (sig.signature_data) {
          try {
            const imgData =
              sig.signature_data.split(',')[1] || sig.signature_data;
            doc.addImage(imgData, 'PNG', 16, currentSigY, 50, 20);
            currentSigY += 25;
          } catch (e) {
            this.logger.error('Erro ao adicionar imagem de assinatura:', e);
            currentSigY += 10;
          }
        } else {
          currentSigY += 10;
        }
      }
    }

    applyBackendPdfFooter(doc);

    return Buffer.from(doc.output('arraybuffer'));
  }

  async createWeldingMachineTemplate() {
    const title = 'Checklist de Máquina de Solda';
    const companyId = this.tenantService.getTenantId();
    if (!companyId) {
      throw new BadRequestException(
        'Não foi possível identificar a empresa para criar o template.',
      );
    }

    const existing = await this.checklistsRepository.findOne({
      where: { titulo: title, is_modelo: true, company_id: companyId },
    });
    if (existing) {
      this.logger.warn(
        `Template "${title}" já existe para a empresa ${companyId}.`,
      );
      return existing;
    }

    const items = [
      {
        item: '1. CONDIÇÕES GERAIS: Carcaça da máquina íntegra',
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
      },
      {
        item: '1. CONDIÇÕES GERAIS: Cabos de alimentação sem cortes ou emendas',
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
      },
      {
        item: '2. SEGURANÇA ELÉTRICA: Aterramento adequado',
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
      },
      {
        item: '3. SEGURANÇA OPERACIONAL: Porta-eletrodo em bom estado',
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
      },
      {
        item: '3. SEGURANÇA OPERACIONAL: Área livre de materiais inflamáveis',
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
      },
      {
        item: '4. EPI DO OPERADOR: Máscara de solda adequada',
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
      },
      {
        item: '4. EPI DO OPERADOR: Luvas de raspa',
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
      },
      {
        item: '5. ORGANIZAÇÃO E AMBIENTE: Cabos organizados (sem risco de tropeço)',
        tipo_resposta: 'sim_nao_na',
        obrigatorio: true,
      },
    ];

    // CORREÇÃO: Removida a lógica de fallback com queries SQL. A criação de templates agora depende do contexto do tenant.
    // Para templates globais, uma estratégia diferente (ex: company_id nulo) deveria ser implementada.
    const checklist = this.checklistsRepository.create({
      titulo: title,
      descricao: 'Inspeção de segurança e operacional para máquina de solda.',
      equipamento: 'Máquina de Solda',
      data: new Date(),
      status: 'Pendente',
      company_id: companyId,
      itens: items,
      is_modelo: true,
      categoria: 'Equipamento',
      periodicidade: 'Diário',
      nivel_risco_padrao: 'Alto',
      ativo: true,
    });

    return this.checklistsRepository.save(checklist);
  }

  async createPresetTemplates() {
    const companyId = this.tenantService.getTenantId();
    if (!companyId) {
      throw new BadRequestException(
        'Não foi possível identificar a empresa para criar os templates.',
      );
    }

    const existingTemplates = await this.checklistsRepository.find({
      where: { company_id: companyId, is_modelo: true },
      select: ['titulo'],
    });
    const existingTitles = new Set(
      existingTemplates.map((item) => item.titulo),
    );

    const templatesToCreate = this.checklistTemplatesByActivity
      .filter((template) => !existingTitles.has(template.titulo))
      .map((template) =>
        this.checklistsRepository.create({
          ...template,
          data: new Date(),
          status: 'Pendente',
          company_id: companyId,
          is_modelo: true,
          ativo: true,
        }),
      );

    if (templatesToCreate.length === 0) {
      return {
        created: 0,
        skipped: this.checklistTemplatesByActivity.length,
        templates: existingTemplates,
      };
    }

    const saved = await this.checklistsRepository.save(templatesToCreate);
    return {
      created: saved.length,
      skipped: this.checklistTemplatesByActivity.length - saved.length,
      templates: saved,
    };
  }

  async fillFromTemplate(
    templateId: string,
    fillData: UpdateChecklistDto,
  ): Promise<ChecklistResponseDto> {
    const template = await this.findOneEntity(templateId);
    if (!template.is_modelo) {
      throw new BadRequestException(
        'O checklist especificado não é um template',
      );
    }

    const newChecklist = this.checklistsRepository.create({
      ...template,
      id: undefined,
      template_id: templateId,
      is_modelo: false,
      ...fillData,
      created_at: undefined,
      updated_at: undefined,
    });
    const saved = await this.checklistsRepository.save(newChecklist);

    try {
      this.notificationsGateway.sendToCompany(
        saved.company_id,
        'checklist:created',
        { id: saved.id, titulo: saved.titulo },
      );
    } catch (e) {
      this.logger.error('Falha ao enviar notificação de checklist criado', e);
    }

    return plainToClass(ChecklistResponseDto, saved);
  }

  async savePdfToStorage(
    id: string,
  ): Promise<{ fileKey: string; folderPath: string; fileUrl: string }> {
    const checklist = await this.findOneEntity(id);
    const pdfBuffer = await this.generatePdf(checklist);

    const date = new Date(checklist.data);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const firstDayOfYear = new Date(year, 0, 1);
    const pastDaysOfYear =
      (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    const weekNumber = Math.ceil(
      (pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7,
    );

    const folderPath = `documents/${checklist.company_id}/checklists/${year}/${month}/semana-${String(weekNumber).padStart(2, '0')}`;
    const fileName = `checklist-${checklist.id}.pdf`;
    const fileKey = `${folderPath}/${fileName}`;

    await this.storageService.uploadFile(fileKey, pdfBuffer, 'application/pdf');
    const fileUrl = await this.storageService.getPresignedDownloadUrl(fileKey);

    await this.documentGovernanceService.registerFinalDocument({
      companyId: checklist.company_id,
      module: 'checklist',
      entityId: checklist.id,
      title: checklist.titulo,
      documentDate: checklist.data,
      fileKey,
      folderPath,
      originalName: fileName,
      mimeType: 'application/pdf',
      createdBy: RequestContext.getUserId() || undefined,
      fileBuffer: pdfBuffer,
      persistEntityMetadata: async (manager) => {
        await manager.getRepository(Checklist).update(
          { id: checklist.id },
          {
            pdf_file_key: fileKey,
            pdf_folder_path: folderPath,
            pdf_original_name: fileName,
          },
        );
      },
    });

    return { fileKey, folderPath, fileUrl };
  }

  async count(options?: { where?: Record<string, unknown> }): Promise<number> {
    const tenantId = this.tenantService.getTenantId();
    const where = options?.where || {};
    return this.checklistsRepository.count({
      where: tenantId ? { ...where, company_id: tenantId } : where,
    });
  }

  async listStoredFiles(filters: WeeklyBundleFilters) {
    const tenantId = this.tenantService.getTenantId();
    const query = this.checklistsRepository
      .createQueryBuilder('c')
      .where('c.pdf_file_key IS NOT NULL');

    if (tenantId) {
      query.andWhere('c.company_id = :tenantId', { tenantId });
    }
    if (filters.companyId) {
      query.andWhere('c.company_id = :companyId', {
        companyId: filters.companyId,
      });
    }

    const results = await query.getMany();

    return results
      .filter((c) => {
        if (!c.created_at) return false;
        const date = new Date(c.created_at);
        if (filters.year && date.getFullYear() !== filters.year) return false;
        if (filters.week) {
          const d = new Date(
            Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
          );
          d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
          const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
          const isoWeek = Math.ceil(
            ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
          );
          if (isoWeek !== filters.week) return false;
        }
        return true;
      })
      .map((c) => ({
        entityId: c.id,
        title: c.titulo,
        date: c.data || c.created_at,
        id: c.id,
        titulo: c.titulo,
        companyId: c.company_id,
        fileKey: c.pdf_file_key,
        folderPath: c.pdf_folder_path,
        originalName: c.pdf_original_name,
      }));
  }

  async getWeeklyBundle(filters: WeeklyBundleFilters) {
    const files = await this.listStoredFiles(filters);
    return this.documentBundleService.buildWeeklyPdfBundle(
      'Checklist',
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
