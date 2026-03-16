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
import {
  Repository,
  DataSource,
  FindOptionsSelect,
  DeepPartial,
  IsNull,
} from 'typeorm';
import { plainToClass } from 'class-transformer';
import { ConfigService } from '@nestjs/config';
import { IntegrationResilienceService } from '../common/resilience/integration-resilience.service';
import { Checklist } from './entities/checklist.entity';
import { ChecklistResponseDto } from './dto/checklist-response.dto';
import { TenantService } from '../common/tenant/tenant.service';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { MailService } from '../mail/mail.service';
import { SignaturesService } from '../signatures/signatures.service';
import { DocumentStorageService } from '../common/services/document-storage.service';
import { FileParserService } from '../document-import/services/file-parser.service';
import { cleanupUploadedFile } from '../common/storage/storage-compensation.util';
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
import { WeeklyBundleFilters } from '../common/services/document-bundle.service';
import { DocumentGovernanceService } from '../document-registry/document-governance.service';
import { RequestContext } from '../common/middleware/request-context.middleware';
import { Company } from '../companies/entities/company.entity';
import { getIsoWeekNumber } from '../common/utils/document-calendar.util';
import { requestOpenAiChatCompletionResponse } from '../ai/openai-request.util';

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
    private readonly documentStorageService: DocumentStorageService,
    private usersService: UsersService,
    private sitesService: SitesService,
    private readonly documentGovernanceService: DocumentGovernanceService,
    private readonly fileParserService: FileParserService,
    private readonly configService: ConfigService,
    private readonly integrationResilienceService: IntegrationResilienceService,
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
    pdf_file_key: true,
    pdf_folder_path: true,
    pdf_original_name: true,
    company: {
      id: true,
      razao_social: true,
    } as FindOptionsSelect<Company>,
    site: {
      id: true,
      nome: true,
    },
    inspetor: {
      id: true,
      nome: true,
    },
  };

  private assertChecklistExecutionRequirements(
    checklist: Pick<Checklist, 'is_modelo' | 'site_id' | 'inspetor_id'>,
  ) {
    if (checklist.is_modelo) {
      return;
    }

    if (!checklist.site_id) {
      throw new BadRequestException(
        'Checklist operacional exige obra/setor vinculado.',
      );
    }

    if (!checklist.inspetor_id) {
      throw new BadRequestException(
        'Checklist operacional exige inspetor responsável.',
      );
    }
  }

  private assertChecklistDocumentMutable(
    checklist: Pick<Checklist, 'is_modelo' | 'pdf_file_key'>,
  ) {
    if (checklist.is_modelo) {
      return;
    }

    if (checklist.pdf_file_key) {
      throw new BadRequestException(
        'Checklist com PDF final emitido. Edição bloqueada. Gere um novo checklist para alterar o documento.',
      );
    }
  }

  private async assertChecklistReadyForFinalPdf(
    checklist: Pick<
      Checklist,
      'id' | 'is_modelo' | 'site_id' | 'inspetor_id' | 'pdf_file_key'
    >,
  ) {
    if (checklist.is_modelo) {
      throw new BadRequestException(
        'Modelos de checklist não podem ser emitidos como documento final.',
      );
    }

    this.assertChecklistExecutionRequirements(checklist);
    this.assertChecklistDocumentMutable(checklist);

    const signatures = await this.signaturesService.findByDocument(
      checklist.id,
      'CHECKLIST',
    );

    if (!signatures.length) {
      throw new BadRequestException(
        'Checklist precisa de ao menos uma assinatura antes da emissão do PDF final.',
      );
    }
  }

  private cloneChecklistItems(
    items: Checklist['itens'],
    options?: { resetExecutionState?: boolean },
  ) {
    if (!Array.isArray(items)) {
      return [];
    }

    return items.map((item: Record<string, unknown>) => {
      const baseItem = {
        id: typeof item.id === 'string' && item.id.trim() ? item.id : undefined,
        item: typeof item.item === 'string' ? item.item : '',
        tipo_resposta:
          typeof item.tipo_resposta === 'string'
            ? item.tipo_resposta
            : 'sim_nao_na',
        obrigatorio: Boolean(item.obrigatorio ?? true),
        peso:
          typeof item.peso === 'number' && Number.isFinite(item.peso)
            ? item.peso
            : 1,
      };

      if (!options?.resetExecutionState) {
        return {
          ...baseItem,
          status:
            typeof item.status === 'string' || typeof item.status === 'boolean'
              ? item.status
              : 'ok',
          resposta: item.resposta ?? '',
          observacao:
            typeof item.observacao === 'string' ? item.observacao : '',
          fotos: Array.isArray(item.fotos)
            ? item.fotos.filter(
                (value): value is string => typeof value === 'string',
              )
            : [],
        };
      }

      return {
        ...baseItem,
        status: baseItem.tipo_resposta === 'conforme' ? 'ok' : 'sim',
        resposta: '',
        observacao: '',
        fotos: [],
      };
    });
  }

  private buildChecklistFromTemplate(
    template: Checklist,
    fillData: UpdateChecklistDto,
  ): Checklist {
    const checklistData: DeepPartial<Checklist> = {
      titulo: fillData.titulo ?? template.titulo,
      descricao: fillData.descricao ?? template.descricao,
      equipamento: fillData.equipamento ?? template.equipamento,
      maquina: fillData.maquina ?? template.maquina,
      foto_equipamento:
        fillData.foto_equipamento ?? template.foto_equipamento ?? undefined,
      data: fillData.data ?? template.data,
      status: fillData.status ?? 'Pendente',
      company_id: template.company_id,
      site_id: fillData.site_id ?? undefined,
      inspetor_id: fillData.inspetor_id ?? undefined,
      itens:
        fillData.itens !== undefined
          ? this.cloneChecklistItems(fillData.itens)
          : this.cloneChecklistItems(template.itens, {
              resetExecutionState: true,
            }),
      is_modelo: false,
      template_id: template.id,
      ativo: fillData.ativo ?? true,
      categoria: fillData.categoria ?? template.categoria,
      periodicidade: fillData.periodicidade ?? template.periodicidade,
      nivel_risco_padrao:
        fillData.nivel_risco_padrao ?? template.nivel_risco_padrao,
      auditado_por_id: fillData.auditado_por_id ?? undefined,
      data_auditoria: fillData.data_auditoria ?? undefined,
      resultado_auditoria: template.resultado_auditoria ?? undefined,
      notas_auditoria: template.notas_auditoria ?? undefined,
    };

    return this.checklistsRepository.create(checklistData);
  }

  private getChecklistDocumentDate(
    checklist: Pick<Checklist, 'data' | 'created_at'>,
  ): Date {
    const candidate = checklist.data
      ? new Date(checklist.data)
      : checklist.created_at
        ? new Date(checklist.created_at)
        : new Date();

    return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
  }

  private buildChecklistDocumentCode(
    checklist: Pick<Checklist, 'id' | 'data' | 'created_at'>,
  ) {
    const year = this.getChecklistDocumentDate(checklist).getFullYear();
    const reference = String(checklist.id || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-8)
      .toUpperCase();
    return `CHK-${year}-${reference}`;
  }

  private resolvePdfImage(imageData: string): {
    data: string;
    format: 'PNG' | 'JPEG';
  } {
    const normalized = imageData.trim();
    const dataUriMatch = normalized.match(
      /^data:image\/(png|jpeg|jpg);base64,(.+)$/i,
    );

    if (dataUriMatch) {
      const format = dataUriMatch[1].toLowerCase() === 'png' ? 'PNG' : 'JPEG';
      return { data: dataUriMatch[2], format };
    }

    return {
      data: normalized.split(',')[1] || normalized,
      format: 'PNG',
    };
  }

  async create(
    createChecklistDto: CreateChecklistDto,
  ): Promise<ChecklistResponseDto> {
    const tenantId = this.tenantService.getTenantId();
    this.logger.log(`Criando checklist para empresa: ${tenantId}`);

    const checklist = this.checklistsRepository.create({
      ...createChecklistDto,
      company_id: tenantId || createChecklistDto.company_id,
      itens: this.cloneChecklistItems(createChecklistDto.itens),
    });
    this.assertChecklistExecutionRequirements(checklist);
    const saved: Checklist = await this.checklistsRepository.save(checklist);
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
      where: { ...filter, deleted_at: IsNull() },
      relations: ['company', 'site', 'inspetor'],
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
      where: { ...filter, deleted_at: IsNull() },
      // LISTING: evitar relations pesadas no endpoint de listagem.
      select: this.checklistListSelect,
      relations: ['company', 'site', 'inspetor'],
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
      where: tenantId
        ? { id, company_id: tenantId, deleted_at: IsNull() }
        : { id, deleted_at: IsNull() },
      relations: ['company', 'site', 'inspetor'],
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
    this.assertChecklistDocumentMutable(checklist);

    if (updateChecklistDto.titulo !== undefined) {
      checklist.titulo = updateChecklistDto.titulo;
    }
    if (updateChecklistDto.descricao !== undefined) {
      checklist.descricao = updateChecklistDto.descricao;
    }
    if (updateChecklistDto.equipamento !== undefined) {
      checklist.equipamento = updateChecklistDto.equipamento;
    }
    if (updateChecklistDto.maquina !== undefined) {
      checklist.maquina = updateChecklistDto.maquina;
    }
    if (updateChecklistDto.foto_equipamento !== undefined) {
      checklist.foto_equipamento = updateChecklistDto.foto_equipamento;
    }
    if (updateChecklistDto.data !== undefined) {
      checklist.data = new Date(updateChecklistDto.data);
    }
    if (updateChecklistDto.status !== undefined) {
      checklist.status = updateChecklistDto.status;
    }
    if (updateChecklistDto.site_id !== undefined) {
      checklist.site_id = updateChecklistDto.site_id;
    }
    if (updateChecklistDto.inspetor_id !== undefined) {
      checklist.inspetor_id = updateChecklistDto.inspetor_id;
    }
    if (updateChecklistDto.itens !== undefined) {
      checklist.itens = this.cloneChecklistItems(updateChecklistDto.itens);
    }
    if (updateChecklistDto.is_modelo !== undefined) {
      checklist.is_modelo = updateChecklistDto.is_modelo;
    }
    if (updateChecklistDto.ativo !== undefined) {
      checklist.ativo = updateChecklistDto.ativo;
    }
    if (updateChecklistDto.categoria !== undefined) {
      checklist.categoria = updateChecklistDto.categoria;
    }
    if (updateChecklistDto.periodicidade !== undefined) {
      checklist.periodicidade = updateChecklistDto.periodicidade;
    }
    if (updateChecklistDto.nivel_risco_padrao !== undefined) {
      checklist.nivel_risco_padrao = updateChecklistDto.nivel_risco_padrao;
    }
    if (updateChecklistDto.auditado_por_id !== undefined) {
      checklist.auditado_por_id = updateChecklistDto.auditado_por_id;
    }
    if (updateChecklistDto.data_auditoria) {
      checklist.data_auditoria = new Date(updateChecklistDto.data_auditoria);
    }

    this.assertChecklistExecutionRequirements(checklist);
    const saved: Checklist = await this.checklistsRepository.save(checklist);

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
        await manager.getRepository(Checklist).softDelete(checklist.id);
      },
      cleanupStoredFile: (fileKey) =>
        this.documentStorageService.deleteFile(fileKey),
    });
  }

  async sendEmail(id: string, to: string) {
    // CORREÇÃO: `sendMailWithAttachment` não existe. Usando `sendMailSimple` que aceita anexos.
    const checklist = await this.findOneEntity(id);
    let pdfBuffer: Buffer;

    if (checklist.pdf_file_key) {
      try {
        pdfBuffer = await this.documentStorageService.downloadFileBuffer(
          checklist.pdf_file_key,
        );
      } catch (error) {
        this.logger.warn(
          `Falha ao reutilizar PDF armazenado do checklist ${checklist.id}. Gerando novamente.`,
          error instanceof Error ? error.stack : undefined,
        );
        pdfBuffer = await this.generatePdf(checklist);
      }
    } else {
      pdfBuffer = await this.generatePdf(checklist);
    }

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
        const { data: imgData, format } = this.resolvePdfImage(
          checklist.foto_equipamento,
        );
        drawBackendSectionTitle(doc, currentY - 10, 'Evidência do equipamento');
        doc.setFillColor(...backendPdfTheme.surface);
        doc.setDrawColor(...backendPdfTheme.border);
        doc.roundedRect(16, currentY - 4, 64, 64, 2, 2, 'FD');
        doc.addImage(imgData, format, 18, currentY - 2, 60, 60);
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
            const { data: imgData, format } = this.resolvePdfImage(
              sig.signature_data,
            );
            doc.addImage(imgData, format, 16, currentSigY, 50, 20);
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

    const newChecklist = this.buildChecklistFromTemplate(template, fillData);
    this.assertChecklistExecutionRequirements(newChecklist);
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
    await this.assertChecklistReadyForFinalPdf(checklist);
    const pdfBuffer = await this.generatePdf(checklist);

    const documentDate = this.getChecklistDocumentDate(checklist);
    const year = documentDate.getFullYear();
    const weekNumber = String(getIsoWeekNumber(documentDate) || 1).padStart(
      2,
      '0',
    );
    const folderPath = `checklists/${checklist.company_id}/${year}/week-${weekNumber}`;
    const fileName = `checklist-${checklist.id}.pdf`;
    const fileKey = this.documentStorageService.generateDocumentKey(
      checklist.company_id,
      `checklists/${year}/week-${weekNumber}`,
      checklist.id,
      fileName,
    );

    await this.documentStorageService.uploadFile(
      fileKey,
      pdfBuffer,
      'application/pdf',
    );
    try {
      const fileUrl =
        await this.documentStorageService.getPresignedDownloadUrl(fileKey);

      await this.documentGovernanceService.registerFinalDocument({
        companyId: checklist.company_id,
        module: 'checklist',
        entityId: checklist.id,
        title: checklist.titulo,
        documentDate,
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
    } catch (error) {
      await cleanupUploadedFile(
        this.logger,
        `checklist:${checklist.id}`,
        fileKey,
        (key) => this.documentStorageService.deleteFile(key),
      );
      throw error;
    }
  }

  async getPdfAccess(id: string): Promise<{
    entityId: string;
    fileKey: string;
    folderPath: string;
    originalName: string;
    url: string | null;
  }> {
    const checklist = await this.findOneEntity(id);
    if (!checklist.pdf_file_key) {
      throw new NotFoundException(`Checklist ${id} não possui PDF armazenado`);
    }

    let url: string | null = null;
    try {
      url = await this.documentStorageService.getSignedUrl(
        checklist.pdf_file_key,
      );
    } catch {
      url = null;
    }

    return {
      entityId: checklist.id,
      fileKey: checklist.pdf_file_key,
      folderPath: checklist.pdf_folder_path,
      originalName: checklist.pdf_original_name,
      url,
    };
  }

  async count(options?: { where?: Record<string, unknown> }): Promise<number> {
    const tenantId = this.tenantService.getTenantId();
    const where = options?.where || {};
    return this.checklistsRepository.count({
      where: tenantId ? { ...where, company_id: tenantId } : where,
    });
  }

  async listStoredFiles(filters: WeeklyBundleFilters) {
    return this.documentGovernanceService.listFinalDocuments(
      'checklist',
      filters,
    );
  }

  async getWeeklyBundle(filters: WeeklyBundleFilters) {
    return this.documentGovernanceService.getModuleWeeklyBundle(
      'checklist',
      'Checklist',
      filters,
    );
  }

  async importFromWord(
    fileBuffer: Buffer,
    mimetype: string,
    originalname: string,
  ): Promise<ChecklistResponseDto> {
    const tenantId = this.tenantService.getTenantId();
    this.logger.log(`Importando checklist do Word para empresa: ${tenantId}`);

    // 1. Extrair texto do arquivo Word/PDF
    const rawText = await this.fileParserService.extractText(
      fileBuffer,
      mimetype,
      originalname,
    );

    if (!rawText || rawText.trim().length < 10) {
      throw new BadRequestException(
        'O arquivo não contém texto suficiente para extrair um checklist.',
      );
    }

    // 2. Enviar para GPT e estruturar como checklist
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    const model =
      this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';

    let structured: {
      titulo: string;
      descricao: string;
      categoria: string;
      periodicidade: string;
      nivel_risco_padrao: string;
      itens: Array<{
        item: string;
        tipo_resposta: string;
        obrigatorio: boolean;
      }>;
    };

    if (!apiKey) {
      this.logger.warn(
        'OPENAI_API_KEY não configurada — usando stub de importação',
      );
      structured = {
        titulo:
          originalname.replace(/\.(docx?|pdf)$/i, '').trim() ||
          'Checklist Importado',
        descricao:
          'Modelo importado de arquivo. Edite os itens conforme necessário.',
        categoria: 'SST',
        periodicidade: 'Por tarefa',
        nivel_risco_padrao: 'Médio',
        itens: rawText
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 3)
          .slice(0, 30)
          .map((line) => ({
            item: line,
            tipo_resposta: 'sim_nao_na',
            obrigatorio: true,
          })),
      };
    } else {
      const systemPrompt = `Você é um especialista em segurança do trabalho (SST/NR).
Analise o texto extraído de um documento Word e estruture-o como um checklist de inspeção SST.
Retorne SOMENTE um JSON válido, sem markdown, sem explicações adicionais.
Formato obrigatório:
{
  "titulo": "título do checklist (curto, descritivo)",
  "descricao": "descrição do propósito do checklist",
  "categoria": "SST|Qualidade|Equipamento|Atividade Crítica|Manutenção",
  "periodicidade": "Diário|Semanal|Mensal|Por tarefa|Por turno|Por entrada",
  "nivel_risco_padrao": "Baixo|Médio|Alto|Crítico",
  "itens": [
    {
      "item": "descrição do item a verificar",
      "tipo_resposta": "sim_nao_na|conforme|texto|sim_nao",
      "obrigatorio": true
    }
  ]
}
Regras:
- Extraia apenas itens que são verificações concretas (não cabeçalhos ou rodapés)
- Prefira tipo_resposta "sim_nao_na" para verificações binárias
- Use "texto" para itens que pedem descrição ou observação
- Limite a no máximo 50 itens`;

      const userPrompt = `Texto extraído do documento "${originalname}":\n\n${rawText.slice(0, 6000)}`;

      const response = await requestOpenAiChatCompletionResponse({
        apiKey,
        body: {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 4000,
        },
        configService: this.configService,
        integration: this.integrationResilienceService,
      });

      if (!response.ok) {
        throw new BadRequestException(
          `Erro ao processar com IA: ${response.status} ${response.statusText}`,
        );
      }

      const json = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      const content = json.choices?.[0]?.message?.content || '';

      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('JSON não encontrado na resposta');
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        const parsedItems = Array.isArray(parsed.itens) ? parsed.itens : [];

        structured = {
          titulo:
            typeof parsed.titulo === 'string' && parsed.titulo.trim()
              ? parsed.titulo.trim()
              : originalname.replace(/\.(docx?|pdf)$/i, '').trim() ||
                'Checklist Importado',
          descricao:
            typeof parsed.descricao === 'string' ? parsed.descricao : '',
          categoria:
            typeof parsed.categoria === 'string' ? parsed.categoria : 'SST',
          periodicidade:
            typeof parsed.periodicidade === 'string'
              ? parsed.periodicidade
              : 'Por tarefa',
          nivel_risco_padrao:
            typeof parsed.nivel_risco_padrao === 'string'
              ? parsed.nivel_risco_padrao
              : 'Médio',
          itens: parsedItems
            .map((item) => {
              const current =
                item && typeof item === 'object'
                  ? (item as Record<string, unknown>)
                  : null;
              if (!current || typeof current.item !== 'string') {
                return null;
              }
              return {
                item: current.item,
                tipo_resposta:
                  typeof current.tipo_resposta === 'string'
                    ? current.tipo_resposta
                    : 'sim_nao_na',
                obrigatorio: current.obrigatorio !== false,
              };
            })
            .filter(
              (
                item,
              ): item is {
                item: string;
                tipo_resposta: string;
                obrigatorio: boolean;
              } => item !== null,
            ),
        };
      } catch {
        throw new BadRequestException(
          'Não foi possível interpretar a resposta da IA. Tente novamente ou ajuste o arquivo.',
        );
      }
    }

    if (!structured.itens?.length) {
      throw new BadRequestException(
        'Nenhum item de checklist foi identificado no documento.',
      );
    }

    // 3. Criar checklist como modelo (is_modelo = true)
    const checklist = this.checklistsRepository.create({
      titulo: structured.titulo || 'Checklist Importado',
      descricao: structured.descricao,
      categoria: structured.categoria || 'SST',
      periodicidade: structured.periodicidade || 'Por tarefa',
      nivel_risco_padrao: structured.nivel_risco_padrao || 'Médio',
      itens: structured.itens.map((item, idx) => ({
        id: `item-${idx + 1}`,
        item: item.item,
        tipo_resposta: item.tipo_resposta || 'sim_nao_na',
        obrigatorio: item.obrigatorio !== false,
        status: 'ok',
        peso: 1,
        observacao: '',
      })),
      is_modelo: true,
      status: 'Pendente',
      data: new Date().toISOString().split('T')[0],
      company_id: tenantId || '',
    });

    const saved = await this.checklistsRepository.save(checklist);
    this.logger.log(
      `Checklist importado do Word salvo como modelo: ${saved.id}`,
    );
    return plainToClass(ChecklistResponseDto, saved);
  }

  /** Validação pública por código de documento (ex.: CHK-2026-XXXXXXXX) */
  async validateByCode(code: string): Promise<{
    valid: boolean;
    code?: string;
    message?: string;
    checklist?: {
      id: string;
      titulo: string;
      status: string;
      data: string;
      is_modelo: boolean;
      site?: string;
      inspetor?: string;
      updated_at: string;
    };
  }> {
    const normalized = code.trim().toUpperCase();

    if (!normalized.startsWith('CHK-')) {
      return {
        valid: false,
        message: 'Código inválido para checklist (esperado CHK-YYYY-XXXXXXXX).',
      };
    }

    const suffix = normalized.split('-').pop();
    if (!suffix || suffix.length < 6) {
      return { valid: false, message: 'Código inválido.' };
    }

    const matches = await this.checklistsRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.site', 'site')
      .leftJoinAndSelect('c.inspetor', 'inspetor')
      .where("REPLACE(c.id::text, '-', '') ILIKE :suffix", {
        suffix: `%${suffix.toLowerCase()}`,
      })
      .andWhere('c.deleted_at IS NULL')
      .orderBy('c.created_at', 'DESC')
      .limit(5)
      .getMany();

    const match = matches.find(
      (cl) => this.buildChecklistDocumentCode(cl) === normalized,
    );

    if (!match) {
      return {
        valid: false,
        message: 'Checklist não encontrado para este código.',
      };
    }

    return {
      valid: true,
      code: normalized,
      checklist: {
        id: match.id,
        titulo: match.titulo,
        status: match.status,
        data:
          match.data instanceof Date
            ? match.data.toISOString().split('T')[0]
            : String(match.data),
        is_modelo: Boolean(match.is_modelo),
        site: match.site?.nome,
        inspetor: match.inspetor?.nome,
        updated_at: match.updated_at?.toISOString() ?? '',
      },
    };
  }
}
