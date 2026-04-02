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
import { FORENSIC_EVENT_TYPES } from '../forensic-trail/forensic-trail.constants';
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
import { DocumentRegistryService } from '../document-registry/document-registry.service';
import { RequestContext } from '../common/middleware/request-context.middleware';
import { Company } from '../companies/entities/company.entity';
import { getIsoWeekNumber } from '../common/utils/document-calendar.util';
import { requestOpenAiChatCompletionResponse } from '../ai/openai-request.util';
import { OpenAiCircuitBreakerService } from '../common/resilience/openai-circuit-breaker.service';
import {
  ChecklistItemValue,
  ChecklistSubitemValue,
  ChecklistTopicValue,
} from './types/checklist-item.type';

type ChecklistPdfAccessAvailability =
  | 'ready'
  | 'registered_without_signed_url'
  | 'not_emitted';

type ChecklistPdfAccessResponse = {
  entityId: string;
  fileKey: string | null;
  folderPath: string | null;
  originalName: string | null;
  url: string | null;
  hasFinalPdf: boolean;
  availability: ChecklistPdfAccessAvailability;
  message: string;
};

type ChecklistPhotoAccessAvailability =
  | 'ready'
  | 'registered_without_signed_url';

type ChecklistPhotoAccessResponse = {
  entityId: string;
  scope: 'equipment' | 'item';
  itemIndex: number | null;
  photoIndex: number | null;
  hasGovernedPhoto: true;
  availability: ChecklistPhotoAccessAvailability;
  fileKey: string;
  originalName: string;
  mimeType: string;
  url: string | null;
  degraded: boolean;
  message: string | null;
};

type ChecklistPhotoAttachResponse = {
  entityId: string;
  scope: 'equipment' | 'item';
  itemIndex: number | null;
  photoIndex: number | null;
  storageMode: 'governed-storage';
  degraded: false;
  message: string;
  photoReference: string;
  photo: {
    fileKey: string;
    originalName: string;
    mimeType: string;
  };
  signaturesReset: boolean;
};

type GovernedChecklistPhotoReferencePayload = {
  v: 1;
  kind: 'governed-storage';
  scope: 'equipment' | 'item';
  fileKey: string;
  originalName: string;
  mimeType: string;
  uploadedAt: string;
  sizeBytes?: number | null;
};

const GOVERNED_CHECKLIST_PHOTO_REF_PREFIX = 'gst:checklist-photo:';

@Injectable({ scope: Scope.REQUEST })
export class ChecklistsService {
  private readonly logger = new Logger(ChecklistsService.name);
  private static readonly MAX_INLINE_IMAGE_BYTES = 1 * 1024 * 1024;
  private readonly checklistTemplatesByActivity: Array<{
    titulo: string;
    descricao: string;
    categoria: string;
    periodicidade: string;
    nivel_risco_padrao: string;
    itens: ChecklistItemValue[];
  }> = [
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
    private readonly documentRegistryService: DocumentRegistryService,
    private readonly fileParserService: FileParserService,
    private readonly configService: ConfigService,
    private readonly integrationResilienceService: IntegrationResilienceService,
    private readonly openAiCircuitBreaker: OpenAiCircuitBreakerService,
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
    if (
      typeof this.tenantService.isSuperAdmin === 'function' &&
      this.tenantService.isSuperAdmin()
    ) {
      return;
    }

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

  private logChecklistEvent(
    event: string,
    checklist: Pick<Checklist, 'id' | 'company_id'> | null,
    extra?: Record<string, unknown>,
  ) {
    this.logger.log({
      event,
      checklistId: checklist?.id ?? null,
      companyId: checklist?.company_id ?? this.tenantService.getTenantId(),
      requestId: RequestContext.getRequestId(),
      actorId: RequestContext.getUserId(),
      ...extra,
    });
  }

  private getInlineImageByteLength(imageData: string): number {
    const trimmed = imageData.trim();
    const base64 = trimmed.includes(',')
      ? trimmed.split(',')[1] || ''
      : trimmed;
    const normalized = base64.replace(/\s+/g, '');

    if (!normalized) {
      return 0;
    }

    const padding = normalized.endsWith('==')
      ? 2
      : normalized.endsWith('=')
        ? 1
        : 0;

    return Math.floor((normalized.length * 3) / 4) - padding;
  }

  private encodeBase64Url(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
  }

  private decodeBase64Url(value: string): string {
    return Buffer.from(value, 'base64url').toString('utf8');
  }

  private buildGovernedChecklistPhotoReference(
    payload: GovernedChecklistPhotoReferencePayload,
  ): string {
    return `${GOVERNED_CHECKLIST_PHOTO_REF_PREFIX}${this.encodeBase64Url(JSON.stringify(payload))}`;
  }

  private parseGovernedChecklistPhotoReference(
    value?: string | null,
  ): GovernedChecklistPhotoReferencePayload | null {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (
      !normalized ||
      !normalized.startsWith(GOVERNED_CHECKLIST_PHOTO_REF_PREFIX)
    ) {
      return null;
    }

    const encodedPayload = normalized.slice(
      GOVERNED_CHECKLIST_PHOTO_REF_PREFIX.length,
    );
    if (!encodedPayload) {
      throw new BadRequestException(
        'Referência de foto governada do checklist inválida.',
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(this.decodeBase64Url(encodedPayload));
    } catch {
      throw new BadRequestException(
        'Referência de foto governada do checklist inválida.',
      );
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      (parsed as GovernedChecklistPhotoReferencePayload).v !== 1 ||
      (parsed as GovernedChecklistPhotoReferencePayload).kind !==
        'governed-storage' ||
      ((parsed as GovernedChecklistPhotoReferencePayload).scope !==
        'equipment' &&
        (parsed as GovernedChecklistPhotoReferencePayload).scope !== 'item') ||
      typeof (parsed as GovernedChecklistPhotoReferencePayload).fileKey !==
        'string' ||
      typeof (parsed as GovernedChecklistPhotoReferencePayload).originalName !==
        'string' ||
      typeof (parsed as GovernedChecklistPhotoReferencePayload).mimeType !==
        'string' ||
      typeof (parsed as GovernedChecklistPhotoReferencePayload).uploadedAt !==
        'string'
    ) {
      throw new BadRequestException(
        'Referência de foto governada do checklist inválida.',
      );
    }

    return parsed as GovernedChecklistPhotoReferencePayload;
  }

  private normalizeInlineImage(
    imageData: unknown,
    fieldLabel: string,
  ): string | undefined {
    if (typeof imageData !== 'string') {
      return undefined;
    }

    const trimmed = imageData.trim();
    if (!trimmed) {
      return undefined;
    }

    if (/^javascript:/i.test(trimmed)) {
      throw new BadRequestException(`${fieldLabel} possui URL inválida.`);
    }

    if (!trimmed.startsWith('data:image/')) {
      return trimmed;
    }

    const matchesDataImage = /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(
      trimmed,
    );
    if (!matchesDataImage) {
      throw new BadRequestException(`${fieldLabel} possui formato inválido.`);
    }

    const byteLength = this.getInlineImageByteLength(trimmed);
    if (byteLength > ChecklistsService.MAX_INLINE_IMAGE_BYTES) {
      throw new BadRequestException(
        `${fieldLabel} excede o limite de ${Math.floor(
          ChecklistsService.MAX_INLINE_IMAGE_BYTES / 1024 / 1024,
        )} MB.`,
      );
    }

    return trimmed;
  }

  private normalizeChecklistPhotoReference(
    imageData: unknown,
    fieldLabel: string,
    options?: {
      allowedGovernedReferences?: Set<string>;
    },
  ): string | undefined {
    if (typeof imageData !== 'string') {
      return undefined;
    }

    const normalized = imageData.trim();
    if (!normalized) {
      return undefined;
    }

    const governedPayload =
      this.parseGovernedChecklistPhotoReference(normalized);
    if (governedPayload) {
      if (!options?.allowedGovernedReferences?.has(normalized)) {
        throw new BadRequestException(
          `${fieldLabel} deve ser enviado pelo endpoint governado de fotos do checklist.`,
        );
      }
      return normalized;
    }

    return this.normalizeInlineImage(imageData, fieldLabel);
  }

  private getAllowedGovernedChecklistPhotoReferences(
    checklist: Pick<Checklist, 'foto_equipamento' | 'itens'>,
  ): Set<string> {
    return new Set(
      this.getGovernedChecklistPhotoEntries(checklist).map(
        (entry) => entry.reference,
      ),
    );
  }

  private getGovernedChecklistPhotoEntries(
    checklist: Pick<Checklist, 'foto_equipamento' | 'itens'>,
  ): Array<{
    reference: string;
    payload: GovernedChecklistPhotoReferencePayload;
    scope: 'equipment' | 'item';
    itemIndex: number | null;
    photoIndex: number | null;
  }> {
    const entries: Array<{
      reference: string;
      payload: GovernedChecklistPhotoReferencePayload;
      scope: 'equipment' | 'item';
      itemIndex: number | null;
      photoIndex: number | null;
    }> = [];

    if (typeof checklist.foto_equipamento === 'string') {
      const payload = this.parseGovernedChecklistPhotoReference(
        checklist.foto_equipamento,
      );
      if (payload) {
        entries.push({
          reference: checklist.foto_equipamento,
          payload,
          scope: 'equipment',
          itemIndex: null,
          photoIndex: null,
        });
      }
    }

    (Array.isArray(checklist.itens) ? checklist.itens : []).forEach(
      (item, itemIndex) => {
        (Array.isArray(item?.fotos) ? item.fotos : []).forEach(
          (photo, photoIndex) => {
            const payload = this.parseGovernedChecklistPhotoReference(photo);
            if (!payload) {
              return;
            }
            entries.push({
              reference: photo,
              payload,
              scope: 'item',
              itemIndex,
              photoIndex,
            });
          },
        );
      },
    );

    return entries;
  }

  private buildChecklistAlphabeticLabel(index: number): string {
    let value = index + 1;
    let label = '';

    while (value > 0) {
      const remainder = (value - 1) % 26;
      label = String.fromCharCode(65 + remainder) + label;
      value = Math.floor((value - 1) / 26);
    }

    return label;
  }

  private normalizeChecklistSubitems(
    subitems: unknown,
  ): ChecklistSubitemValue[] {
    if (!Array.isArray(subitems)) {
      return [];
    }

    return subitems
      .map((subitem, index) => {
        const current =
          subitem && typeof subitem === 'object'
            ? (subitem as Record<string, unknown>)
            : {};
        const texto =
          typeof current.descricao === 'string'
            ? current.descricao.trim()
            : typeof current.texto === 'string'
              ? current.texto.trim()
              : typeof current.item === 'string'
                ? current.item.trim()
                : '';

        if (!texto) {
          return null;
        }

        const normalized: ChecklistSubitemValue = {
          texto,
          ordem:
            typeof current.ordem === 'number' && Number.isFinite(current.ordem)
              ? current.ordem
              : index + 1,
          status:
            typeof current.status === 'string' || typeof current.status === 'boolean'
              ? (current.status as ChecklistSubitemValue['status'])
              : undefined,
          resposta: current.resposta,
          observacao:
            typeof current.observacao === 'string'
              ? current.observacao.trim()
              : '',
        };

        if (typeof current.id === 'string' && current.id.trim()) {
          normalized.id = current.id.trim();
        }

        return normalized;
      })
      .filter((value): value is ChecklistSubitemValue => value !== null);
  }

  private normalizeChecklistItemValue(
    item: unknown,
    options?: {
      topicoId?: string;
      topicoTitulo?: string;
      ordemTopico?: number;
      ordemItem?: number;
      resetExecutionState?: boolean;
      allowedGovernedReferences?: Set<string>;
    },
  ): ChecklistItemValue | null {
    const current =
      item && typeof item === 'object'
        ? (item as Record<string, unknown>)
        : {};
    const itemTitle =
      typeof current.item === 'string' ? current.item.trim() : '';

    if (!itemTitle) {
      return null;
    }

    const normalizedItem: ChecklistItemValue = {
      id:
        typeof current.id === 'string' && current.id.trim()
          ? current.id.trim()
          : undefined,
      item: itemTitle,
      topico_id:
        typeof current.topico_id === 'string' && current.topico_id.trim()
          ? current.topico_id.trim()
          : options?.topicoId,
      topico_titulo:
        typeof current.topico_titulo === 'string' &&
        current.topico_titulo.trim()
          ? current.topico_titulo.trim()
          : options?.topicoTitulo,
      ordem_topico:
        typeof current.ordem_topico === 'number' &&
        Number.isFinite(current.ordem_topico)
          ? current.ordem_topico
          : options?.ordemTopico,
      ordem_item:
        typeof current.ordem_item === 'number' &&
        Number.isFinite(current.ordem_item)
          ? current.ordem_item
          : options?.ordemItem,
      tipo_resposta:
        typeof current.tipo_resposta === 'string'
          ? (current.tipo_resposta as ChecklistItemValue['tipo_resposta'])
          : 'sim_nao_na',
      obrigatorio:
        typeof current.obrigatorio === 'boolean'
          ? current.obrigatorio
          : Boolean(current.obrigatorio ?? true),
      peso:
        typeof current.peso === 'number' && Number.isFinite(current.peso)
          ? current.peso
          : 1,
      subitens: this.normalizeChecklistSubitems(current.subitens),
    };

    if (options?.resetExecutionState) {
      normalizedItem.status =
        normalizedItem.tipo_resposta === 'conforme'
          ? ('ok' as ChecklistItemValue['status'])
          : ('sim' as ChecklistItemValue['status']);
      normalizedItem.resposta = '';
      normalizedItem.observacao = '';
      normalizedItem.fotos = [];
    } else {
      normalizedItem.status =
        typeof current.status === 'string' || typeof current.status === 'boolean'
          ? (current.status as ChecklistItemValue['status'])
          : 'ok';
      normalizedItem.resposta = current.resposta ?? '';
      normalizedItem.observacao =
        typeof current.observacao === 'string' ? current.observacao : '';
      normalizedItem.fotos = Array.isArray(current.fotos)
        ? current.fotos.filter((value): value is string => typeof value === 'string')
        : [];
    }

    return normalizedItem;
  }

  private normalizeChecklistItems(
    items: unknown,
    options?: {
      resetExecutionState?: boolean;
      allowedGovernedReferences?: Set<string>;
    },
  ): ChecklistItemValue[] {
    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .map((item, index) =>
        this.normalizeChecklistItemValue(item, {
          ...options,
          ordemItem: index + 1,
        }),
      )
      .filter((value): value is ChecklistItemValue => value !== null)
      .map((item, index) => ({
        ...item,
        fotos: Array.isArray(item.fotos)
          ? item.fotos
              .map((photo) =>
                this.normalizeChecklistPhotoReference(
                  photo,
                  `Foto do item ${index + 1} do checklist`,
                  {
                    allowedGovernedReferences: options?.allowedGovernedReferences,
                  },
                ),
              )
              .filter((photo): photo is string => Boolean(photo))
          : [],
      }));
  }

  private flattenChecklistTopics(
    topicos: unknown,
    options?: {
      resetExecutionState?: boolean;
      allowedGovernedReferences?: Set<string>;
    },
  ): ChecklistItemValue[] {
    if (!Array.isArray(topicos)) {
      return [];
    }

    return topicos.flatMap((topico, topicoIndex) => {
      const current =
        topico && typeof topico === 'object'
          ? (topico as Record<string, unknown>)
          : {};
      const topicoId =
        typeof current.id === 'string' && current.id.trim()
          ? current.id.trim()
          : `topic-${topicoIndex + 1}`;
      const topicoTitulo =
        typeof current.titulo === 'string' && current.titulo.trim()
          ? current.titulo.trim()
          : `Tópico ${topicoIndex + 1}`;
      const topicItems = Array.isArray(current.itens)
        ? current.itens
        : Array.isArray(current.items)
          ? current.items
          : [];

      return topicItems
        .map((item, itemIndex) =>
          this.normalizeChecklistItemValue(item, {
            ...options,
            topicoId,
            topicoTitulo,
            ordemTopico:
              typeof current.ordem === 'number' && Number.isFinite(current.ordem)
                ? current.ordem
                : topicoIndex + 1,
            ordemItem: itemIndex + 1,
          }),
        )
        .filter((value): value is ChecklistItemValue => value !== null);
    });
  }

  private resolveChecklistItemsForPersistence(
    input: {
      itens?: unknown;
      topicos?: unknown;
    },
    options?: {
      resetExecutionState?: boolean;
      allowedGovernedReferences?: Set<string>;
    },
  ): ChecklistItemValue[] {
    const hasTopics = Array.isArray(input.topicos) && input.topicos.length > 0;

    if (hasTopics) {
      const flattened = this.flattenChecklistTopics(input.topicos, options);
      if (flattened.length > 0) {
        return flattened;
      }
    }

    return this.normalizeChecklistItems(input.itens, options);
  }

  private buildChecklistTopicsFromItems(
    items: ChecklistItemValue[] | undefined,
  ): ChecklistTopicValue[] {
    if (!Array.isArray(items) || !items.length) {
      return [];
    }

    const topics = new Map<
      string,
      ChecklistTopicValue & { __firstSeen: number }
    >();

    items.forEach((item, index) => {
      const title =
        typeof item.topico_titulo === 'string' && item.topico_titulo.trim()
          ? item.topico_titulo.trim()
          : 'Itens do checklist';
      const id =
        typeof item.topico_id === 'string' && item.topico_id.trim()
          ? item.topico_id.trim()
          : `topic-${title.toLowerCase().replace(/[^a-z0-9]+/gi, '-') || 'legacy'}`;
      const existing = topics.get(id);
      const nextItem = {
        ...item,
        subitens: this.normalizeChecklistSubitems(item.subitens),
      };

      if (!existing) {
        topics.set(id, {
          id,
          titulo: title,
          ordem:
            typeof item.ordem_topico === 'number' && Number.isFinite(item.ordem_topico)
              ? item.ordem_topico
              : undefined,
          itens: [nextItem],
          __firstSeen: index,
        });
        return;
      }

      if (existing.titulo === 'Itens do checklist' && title !== existing.titulo) {
        existing.titulo = title;
      }
      existing.itens.push(nextItem);
      if (
        typeof existing.ordem !== 'number' &&
        typeof item.ordem_topico === 'number' &&
        Number.isFinite(item.ordem_topico)
      ) {
        existing.ordem = item.ordem_topico;
      }
    });

    return Array.from(topics.values())
      .sort((a, b) => {
        const aOrder = typeof a.ordem === 'number' ? a.ordem : Number.MAX_SAFE_INTEGER;
        const bOrder = typeof b.ordem === 'number' ? b.ordem : Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }
        return a.__firstSeen - b.__firstSeen;
      })
      .map(({ __firstSeen, ...topic }) => ({
        ...topic,
        itens: topic.itens.sort((a, b) => {
          const aOrder =
            typeof a.ordem_item === 'number'
              ? a.ordem_item
              : Number.MAX_SAFE_INTEGER;
          const bOrder =
            typeof b.ordem_item === 'number'
              ? b.ordem_item
              : Number.MAX_SAFE_INTEGER;
          return aOrder - bOrder;
        }),
      }));
  }

  private toChecklistResponse(checklist: Checklist): ChecklistResponseDto {
    const topicos = this.buildChecklistTopicsFromItems(
      Array.isArray(checklist.itens) ? checklist.itens : [],
    );
    return plainToClass(ChecklistResponseDto, {
      ...checklist,
      topicos,
    });
  }

  private async cleanupGovernedChecklistPhotoFiles(
    checklistId: string,
    removedEntries: Array<{
      payload: GovernedChecklistPhotoReferencePayload;
    }>,
  ): Promise<void> {
    await Promise.all(
      removedEntries.map(async ({ payload }) => {
        try {
          await this.documentStorageService.deleteFile(payload.fileKey);
          this.logChecklistEvent('checklist_photo_removed_from_storage', null, {
            checklistId,
            fileKey: payload.fileKey,
            originalName: payload.originalName,
          });
        } catch (error) {
          this.logChecklistEvent(
            'checklist_photo_storage_cleanup_failed',
            null,
            {
              checklistId,
              fileKey: payload.fileKey,
              originalName: payload.originalName,
              errorMessage: error instanceof Error ? error.message : 'unknown',
            },
          );
        }
      }),
    );
  }

  private buildChecklistMaterialSnapshot(
    checklist: Pick<
      Checklist,
      | 'titulo'
      | 'descricao'
      | 'equipamento'
      | 'maquina'
      | 'foto_equipamento'
      | 'data'
      | 'site_id'
      | 'inspetor_id'
      | 'itens'
      | 'categoria'
      | 'periodicidade'
      | 'nivel_risco_padrao'
      | 'auditado_por_id'
      | 'data_auditoria'
      | 'resultado_auditoria'
      | 'notas_auditoria'
    >,
  ): string {
    return JSON.stringify({
      titulo: checklist.titulo ?? '',
      descricao: checklist.descricao ?? '',
      equipamento: checklist.equipamento ?? '',
      maquina: checklist.maquina ?? '',
      foto_equipamento: checklist.foto_equipamento ?? '',
      data:
        checklist.data instanceof Date
          ? checklist.data.toISOString()
          : checklist.data
            ? new Date(checklist.data).toISOString()
            : '',
      site_id: checklist.site_id ?? '',
      inspetor_id: checklist.inspetor_id ?? '',
      itens: this.cloneChecklistItems(checklist.itens),
      categoria: checklist.categoria ?? '',
      periodicidade: checklist.periodicidade ?? '',
      nivel_risco_padrao: checklist.nivel_risco_padrao ?? '',
      auditado_por_id: checklist.auditado_por_id ?? '',
      data_auditoria:
        checklist.data_auditoria instanceof Date
          ? checklist.data_auditoria.toISOString()
          : checklist.data_auditoria
            ? new Date(checklist.data_auditoria).toISOString()
            : '',
      resultado_auditoria: checklist.resultado_auditoria ?? '',
      notas_auditoria: checklist.notas_auditoria ?? '',
    });
  }

  private async resetChecklistSignatures(
    checklist: Pick<Checklist, 'id' | 'company_id' | 'is_modelo'>,
    reason: string,
  ): Promise<boolean> {
    if (checklist.is_modelo) {
      return false;
    }

    const removedCount = await this.signaturesService.removeByDocumentSystem(
      checklist.id,
      'CHECKLIST',
    );

    if (removedCount > 0) {
      this.logChecklistEvent('checklist_signatures_reset', checklist, {
        reason,
        removedCount,
      });
      return true;
    }

    return false;
  }

  private async buildChecklistPhotoAccessResponse(
    checklistId: string,
    input: {
      scope: 'equipment' | 'item';
      itemIndex: number | null;
      photoIndex: number | null;
      payload: GovernedChecklistPhotoReferencePayload;
    },
  ): Promise<ChecklistPhotoAccessResponse> {
    let url: string | null = null;
    let availability: ChecklistPhotoAccessAvailability = 'ready';
    let message: string | null = null;

    try {
      url = await this.documentStorageService.getPresignedDownloadUrl(
        input.payload.fileKey,
      );
    } catch (error) {
      availability = 'registered_without_signed_url';
      message =
        'A foto governada foi localizada, mas a URL assinada não está disponível no momento.';
      this.logChecklistEvent('checklist_photo_access_degraded', null, {
        checklistId,
        scope: input.scope,
        itemIndex: input.itemIndex,
        photoIndex: input.photoIndex,
        fileKey: input.payload.fileKey,
        errorMessage: error instanceof Error ? error.message : 'unknown',
      });
    }

    this.logChecklistEvent('checklist_photo_access_checked', null, {
      checklistId,
      scope: input.scope,
      itemIndex: input.itemIndex,
      photoIndex: input.photoIndex,
      availability,
      fileKey: input.payload.fileKey,
    });

    return {
      entityId: checklistId,
      scope: input.scope,
      itemIndex: input.itemIndex,
      photoIndex: input.photoIndex,
      hasGovernedPhoto: true,
      availability,
      fileKey: input.payload.fileKey,
      originalName: input.payload.originalName,
      mimeType: input.payload.mimeType,
      url,
      degraded: availability !== 'ready',
      message,
    };
  }

  private sanitizeChecklistItems(
    items: UpdateChecklistDto['itens'],
    options?: {
      resetExecutionState?: boolean;
      allowedGovernedReferences?: Set<string>;
    },
  ) {
    return this.normalizeChecklistItems(items, options);
  }

  private deriveChecklistStatus(
    input: Pick<Checklist, 'is_modelo'> & {
      status?: string | null;
      itens?: unknown;
    },
  ): Checklist['status'] {
    if (input.is_modelo) {
      if (
        input.status === 'Conforme' ||
        input.status === 'Não Conforme' ||
        input.status === 'Pendente'
      ) {
        return input.status;
      }
      return 'Pendente';
    }

    const items = Array.isArray(input.itens) ? input.itens : [];
    if (!items.length) {
      return 'Pendente';
    }

    let hasPending = false;
    let hasNonConformity = false;

    for (const rawItem of items) {
      const item =
        rawItem && typeof rawItem === 'object'
          ? (rawItem as Record<string, unknown>)
          : {};
      const assessmentStatuses = this.getChecklistAssessmentStatuses(item);

      for (const status of assessmentStatuses) {
        if (
          status === 'nok' ||
          status === 'nao' ||
          status === false ||
          status === 'Não Conforme'
        ) {
          hasNonConformity = true;
          break;
        }

        if (
          status === undefined ||
          status === null ||
          status === '' ||
          status === 'Pendente'
        ) {
          hasPending = true;
        }
      }

      if (hasNonConformity) {
        break;
      }
    }

    if (hasNonConformity) {
      return 'Não Conforme';
    }

    if (hasPending) {
      return 'Pendente';
    }

    return 'Conforme';
  }

  private getChecklistAssessmentStatuses(
    item: Record<string, unknown>,
  ): unknown[] {
    const subitems = Array.isArray(item.subitens) ? item.subitens : [];
    const subitemStatuses = subitems
      .map((subitem) =>
        subitem && typeof subitem === 'object'
          ? (subitem as Record<string, unknown>).status
          : undefined,
      )
      .filter((status) => status !== undefined);

    if (subitemStatuses.length > 0) {
      return subitemStatuses;
    }

    return [item.status];
  }

  private async validateChecklistRelations(checklist: {
    company_id?: string | null;
    site_id?: string | null;
    inspetor_id?: string | null;
    auditado_por_id?: string | null;
  }) {
    if (!checklist.company_id) {
      throw new BadRequestException(
        'Não foi possível identificar a empresa do checklist.',
      );
    }

    if (checklist.site_id) {
      await this.sitesService.findOne(checklist.site_id);
    }

    if (checklist.inspetor_id) {
      await this.usersService.findOne(checklist.inspetor_id);
    }

    if (checklist.auditado_por_id) {
      await this.usersService.findOne(checklist.auditado_por_id);
    }
  }

  private cloneChecklistItems(
    items: Checklist['itens'] | undefined,
    options?: { resetExecutionState?: boolean },
  ) {
    return this.normalizeChecklistItems(items, options);
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
        (Array.isArray(fillData.topicos) && fillData.topicos.length > 0) ||
        fillData.itens !== undefined
          ? this.resolveChecklistItemsForPersistence(
              {
                itens: fillData.itens,
                topicos: fillData.topicos,
              },
              {
                resetExecutionState: true,
              },
            )
          : this.normalizeChecklistItems(
              Array.isArray(template.itens) ? template.itens : undefined,
              {
                resetExecutionState: true,
              },
            ),
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

  private async resolveChecklistPdfImage(imageData: string): Promise<{
    data: string;
    format: 'PNG' | 'JPEG';
  }> {
    const governedPhoto = this.parseGovernedChecklistPhotoReference(imageData);
    if (!governedPhoto) {
      return this.resolvePdfImage(imageData);
    }

    const buffer = await this.documentStorageService.downloadFileBuffer(
      governedPhoto.fileKey,
    );
    const base64 = buffer.toString('base64');
    const isPng =
      governedPhoto.mimeType === 'image/png' ||
      governedPhoto.originalName.toLowerCase().endsWith('.png');

    return {
      data: base64,
      format: isPng ? 'PNG' : 'JPEG',
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
      foto_equipamento: this.normalizeChecklistPhotoReference(
        createChecklistDto.foto_equipamento,
        'Foto do equipamento',
      ),
      itens: this.resolveChecklistItemsForPersistence({
        itens: createChecklistDto.itens,
        topicos: createChecklistDto.topicos,
      }),
    });
    checklist.status = this.deriveChecklistStatus(checklist);
    this.assertChecklistExecutionRequirements(checklist);
    await this.validateChecklistRelations(checklist);
    const saved: Checklist = await this.checklistsRepository.save(checklist);
    this.logChecklistEvent('checklist_created', saved, {
      isTemplate: saved.is_modelo,
      status: saved.status,
      itemsCount: Array.isArray(saved.itens) ? saved.itens.length : 0,
    });
    return this.toChecklistResponse(saved);
  }

  async findAll(options?: {
    onlyTemplates?: boolean;
    excludeTemplates?: boolean;
    take?: number;
    select?: (keyof Checklist)[];
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
      ...(options?.select?.length
        ? { select: options.select }
        : { relations: ['company', 'site', 'inspetor', 'auditado_por'] }),
      order: { created_at: 'DESC' },
      ...(options?.take !== undefined && { take: options.take }),
    });
    return results.map((c) => this.toChecklistResponse(c));
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

    const data = rows.map((c) => this.toChecklistResponse(c));
    return toOffsetPage(data, total, page, limit);
  }

  async findOne(id: string): Promise<ChecklistResponseDto> {
    const checklist = await this.findOneEntity(id);
    return this.toChecklistResponse(checklist);
  }

  async findOneEntity(id: string): Promise<Checklist> {
    const tenantId = this.tenantService.getTenantId();
    const checklist = await this.checklistsRepository.findOne({
      where: tenantId
        ? { id, company_id: tenantId, deleted_at: IsNull() }
        : { id, deleted_at: IsNull() },
      relations: ['company', 'site', 'inspetor', 'auditado_por'],
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
    const allowedGovernedPhotoReferences =
      this.getAllowedGovernedChecklistPhotoReferences(checklist);
    const previousPhotoEntries =
      this.getGovernedChecklistPhotoEntries(checklist);
    const previousMaterialSnapshot =
      this.buildChecklistMaterialSnapshot(checklist);

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
      checklist.foto_equipamento =
        this.normalizeChecklistPhotoReference(
          updateChecklistDto.foto_equipamento,
          'Foto do equipamento',
          {
            allowedGovernedReferences: allowedGovernedPhotoReferences,
          },
        ) ?? '';
    }
    if (updateChecklistDto.data !== undefined) {
      checklist.data = new Date(updateChecklistDto.data);
    }
    if (updateChecklistDto.site_id !== undefined) {
      checklist.site_id = updateChecklistDto.site_id;
    }
    if (updateChecklistDto.inspetor_id !== undefined) {
      checklist.inspetor_id = updateChecklistDto.inspetor_id;
    }
    if (
      updateChecklistDto.itens !== undefined ||
      updateChecklistDto.topicos !== undefined
    ) {
      checklist.itens = this.resolveChecklistItemsForPersistence(
        {
          itens: updateChecklistDto.itens,
          topicos: updateChecklistDto.topicos,
        },
        {
          allowedGovernedReferences: allowedGovernedPhotoReferences,
        },
      );
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

    checklist.status = this.deriveChecklistStatus({
      ...checklist,
      status: updateChecklistDto.status ?? checklist.status,
    });
    this.assertChecklistExecutionRequirements(checklist);
    await this.validateChecklistRelations(checklist);
    const saved: Checklist = await this.checklistsRepository.save(checklist);
    const nextPhotoEntries = this.getGovernedChecklistPhotoEntries(saved);
    const nextPhotoReferences = new Set(
      nextPhotoEntries.map((entry) => entry.reference),
    );
    const removedPhotoEntries = previousPhotoEntries.filter(
      (entry) => !nextPhotoReferences.has(entry.reference),
    );
    if (removedPhotoEntries.length > 0) {
      await this.cleanupGovernedChecklistPhotoFiles(
        saved.id,
        removedPhotoEntries,
      );
    }
    const materialChanged =
      previousMaterialSnapshot !== this.buildChecklistMaterialSnapshot(saved);
    const signaturesReset = materialChanged
      ? await this.resetChecklistSignatures(saved, 'material_update')
      : false;

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

    this.logChecklistEvent('checklist_updated', saved, {
      isTemplate: saved.is_modelo,
      status: saved.status,
      itemsCount: Array.isArray(saved.itens) ? saved.itens.length : 0,
      signaturesReset,
      removedGovernedPhotos: removedPhotoEntries.length,
    });

    return this.toChecklistResponse(saved);
  }

  async remove(id: string): Promise<void> {
    const checklist = await this.findOneEntity(id);
    const governedPhotoEntries =
      this.getGovernedChecklistPhotoEntries(checklist);
    await this.documentGovernanceService.removeFinalDocumentReference({
      companyId: checklist.company_id,
      module: 'checklist',
      entityId: checklist.id,
      trailEventType: FORENSIC_EVENT_TYPES.FINAL_DOCUMENT_REMOVED,
      trailMetadata: {
        removalMode: 'soft_delete',
      },
      removeEntityState: async (manager) => {
        await manager.getRepository(Checklist).softDelete(checklist.id);
      },
      cleanupStoredFile: (fileKey) =>
        this.documentStorageService.deleteFile(fileKey),
    });
    if (governedPhotoEntries.length > 0) {
      await this.cleanupGovernedChecklistPhotoFiles(
        checklist.id,
        governedPhotoEntries,
      );
    }
    await this.resetChecklistSignatures(checklist, 'checklist_removed');
  }

  async attachEquipmentPhoto(
    id: string,
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<ChecklistPhotoAttachResponse> {
    const checklist = await this.findOneEntity(id);
    this.assertChecklistDocumentMutable(checklist);

    const currentEquipmentPhoto =
      typeof checklist.foto_equipamento === 'string'
        ? checklist.foto_equipamento
        : null;
    const previousGovernedPhoto = currentEquipmentPhoto
      ? this.parseGovernedChecklistPhotoReference(currentEquipmentPhoto)
      : null;
    const sanitizedOriginalName = originalName?.trim() || 'foto-equipamento';
    const fileKey = this.documentStorageService.generateDocumentKey(
      checklist.company_id,
      'checklist-photos',
      checklist.id,
      sanitizedOriginalName,
    );

    await this.documentStorageService.uploadFile(fileKey, buffer, mimeType);

    try {
      const photoReference = this.buildGovernedChecklistPhotoReference({
        v: 1,
        kind: 'governed-storage',
        scope: 'equipment',
        fileKey,
        originalName: sanitizedOriginalName,
        mimeType,
        uploadedAt: new Date().toISOString(),
        sizeBytes: buffer.byteLength,
      });

      checklist.foto_equipamento = photoReference;
      const saved = await this.checklistsRepository.save(checklist);
      const signaturesReset = await this.resetChecklistSignatures(
        saved,
        'equipment_photo_updated',
      );

      if (
        previousGovernedPhoto &&
        previousGovernedPhoto.fileKey !== fileKey &&
        currentEquipmentPhoto
      ) {
        await this.cleanupGovernedChecklistPhotoFiles(saved.id, [
          {
            payload: previousGovernedPhoto,
          },
        ]);
      }

      this.logChecklistEvent('checklist_equipment_photo_uploaded', saved, {
        fileKey,
        originalName: sanitizedOriginalName,
        mimeType,
        signaturesReset,
      });

      return {
        entityId: saved.id,
        scope: 'equipment',
        itemIndex: null,
        photoIndex: null,
        storageMode: 'governed-storage',
        degraded: false,
        message: 'Foto do equipamento anexada ao checklist com governança.',
        photoReference,
        photo: {
          fileKey,
          originalName: sanitizedOriginalName,
          mimeType,
        },
        signaturesReset,
      };
    } catch (error) {
      await cleanupUploadedFile(
        this.logger,
        'checklists.attachEquipmentPhoto',
        fileKey,
        (key) => this.documentStorageService.deleteFile(key),
      );
      throw error;
    }
  }

  async attachItemPhoto(
    id: string,
    itemIndex: number,
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<ChecklistPhotoAttachResponse> {
    const checklist = await this.findOneEntity(id);
    this.assertChecklistDocumentMutable(checklist);

    if (!Array.isArray(checklist.itens) || !checklist.itens[itemIndex]) {
      throw new BadRequestException('Item do checklist não encontrado.');
    }

    const sanitizedOriginalName = originalName?.trim() || 'foto-item';
    const fileKey = this.documentStorageService.generateDocumentKey(
      checklist.company_id,
      'checklist-photos',
      checklist.id,
      sanitizedOriginalName,
    );

    await this.documentStorageService.uploadFile(fileKey, buffer, mimeType);

    try {
      const items = this.cloneChecklistItems(checklist.itens);
      const targetItem = items[itemIndex];
      const nextPhotos = Array.isArray(targetItem.fotos)
        ? [...targetItem.fotos]
        : [];
      const photoReference = this.buildGovernedChecklistPhotoReference({
        v: 1,
        kind: 'governed-storage',
        scope: 'item',
        fileKey,
        originalName: sanitizedOriginalName,
        mimeType,
        uploadedAt: new Date().toISOString(),
        sizeBytes: buffer.byteLength,
      });

      nextPhotos.push(photoReference);
      targetItem.fotos = nextPhotos;
      checklist.itens = items;
      const saved = await this.checklistsRepository.save(checklist);
      const signaturesReset = await this.resetChecklistSignatures(
        saved,
        'item_photo_added',
      );
      const photoIndex = nextPhotos.length - 1;

      this.logChecklistEvent('checklist_item_photo_uploaded', saved, {
        itemIndex,
        photoIndex,
        fileKey,
        originalName: sanitizedOriginalName,
        mimeType,
        signaturesReset,
      });

      return {
        entityId: saved.id,
        scope: 'item',
        itemIndex,
        photoIndex,
        storageMode: 'governed-storage',
        degraded: false,
        message: 'Foto do item anexada ao checklist com governança.',
        photoReference,
        photo: {
          fileKey,
          originalName: sanitizedOriginalName,
          mimeType,
        },
        signaturesReset,
      };
    } catch (error) {
      await cleanupUploadedFile(
        this.logger,
        'checklists.attachItemPhoto',
        fileKey,
        (key) => this.documentStorageService.deleteFile(key),
      );
      throw error;
    }
  }

  async getEquipmentPhotoAccess(
    id: string,
  ): Promise<ChecklistPhotoAccessResponse> {
    const checklist = await this.findOneEntity(id);
    const governedPhoto = this.parseGovernedChecklistPhotoReference(
      checklist.foto_equipamento,
    );

    if (!governedPhoto) {
      throw new NotFoundException(
        'O checklist não possui foto do equipamento em armazenamento governado.',
      );
    }

    return this.buildChecklistPhotoAccessResponse(checklist.id, {
      scope: 'equipment',
      itemIndex: null,
      photoIndex: null,
      payload: governedPhoto,
    });
  }

  async getItemPhotoAccess(
    id: string,
    itemIndex: number,
    photoIndex: number,
  ): Promise<ChecklistPhotoAccessResponse> {
    const checklist = await this.findOneEntity(id);
    const item = Array.isArray(checklist.itens)
      ? checklist.itens[itemIndex]
      : null;
    const photo =
      item && Array.isArray(item.fotos) ? item.fotos[photoIndex] : undefined;
    const governedPhoto = this.parseGovernedChecklistPhotoReference(photo);

    if (!governedPhoto) {
      throw new NotFoundException(
        'A foto do item não está em armazenamento governado.',
      );
    }

    return this.buildChecklistPhotoAccessResponse(checklist.id, {
      scope: 'item',
      itemIndex,
      photoIndex,
      payload: governedPhoto,
    });
  }

  async sendEmail(id: string, to: string) {
    const checklist = await this.findOneEntity(id);
    const access = await this.getPdfAccess(id);
    if (!access.hasFinalPdf || !access.fileKey) {
      this.logChecklistEvent(
        'checklist_email_blocked_without_final_pdf',
        checklist,
        {
          recipient: to,
        },
      );
      throw new BadRequestException(
        'Emita o PDF final governado antes de enviar este checklist por e-mail.',
      );
    }

    try {
      const result = await this.mailService.sendStoredDocument(
        checklist.id,
        'CHECKLIST',
        to,
        checklist.company_id,
      );
      this.logChecklistEvent('checklist_email_sent', checklist, {
        reusedFinalPdf: true,
        recipient: to,
        artifactType: result.artifactType,
        fallbackUsed: result.fallbackUsed,
      });
      return result;
    } catch (error) {
      this.logChecklistEvent(
        'checklist_email_failed_official_pdf_unavailable',
        checklist,
        {
          recipient: to,
          errorMessage: error instanceof Error ? error.message : 'unknown',
        },
      );
      throw error;
    }
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

    let currentY = 74;
    if (checklist.foto_equipamento) {
      try {
        const { data: imgData, format } = await this.resolveChecklistPdfImage(
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

    const topicsForPdf = this.buildChecklistTopicsFromItems(
      Array.isArray(checklist.itens) ? checklist.itens : [],
    );

    const normalizePdfStatus = (status: unknown): string => {
      if (status === true || status === 'ok' || status === 'sim') {
        return 'Conforme';
      }
      if (status === false || status === 'nok' || status === 'nao') {
        return 'Não Conforme';
      }
      if (status === 'na') {
        return 'N/A';
      }
      return typeof status === 'string' && status.trim()
        ? status
        : 'N/A';
    };

    const renderTopicTable = (topic: ChecklistTopicValue) => {
      const rows = (topic.itens || []).map((item, index) => {
        const itemNumber =
          typeof item.ordem_item === 'number' && Number.isFinite(item.ordem_item)
            ? item.ordem_item
            : index + 1;
        const subitemsText = Array.isArray(item.subitens) && item.subitens.length
          ? item.subitens
              .map((subitem, subIndex) => {
                const label =
                  typeof subitem.ordem === 'number' && Number.isFinite(subitem.ordem)
                    ? this.buildChecklistAlphabeticLabel(subitem.ordem - 1)
                    : this.buildChecklistAlphabeticLabel(subIndex);
                const subitemStatus = normalizePdfStatus(subitem.status);
                const suffix =
                  subitem.status === undefined || subitem.status === null
                    ? ''
                    : ` — ${subitemStatus}`;
                return `${label}) ${subitem.texto}${suffix}`;
              })
              .join('\n')
          : '';
        const itemText = `${itemNumber}. ${item.item}`;
        return [
          subitemsText ? `${itemText}\n${subitemsText}` : itemText,
          normalizePdfStatus(item.status),
          item.observacao || '',
        ];
      });

      return rows;
    };

    const renderTopicSection = (topic: ChecklistTopicValue) => {
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }

      drawBackendSectionTitle(doc, currentY - 6, topic.titulo);
      currentY += 2;

      autoTable(doc, {
        startY: currentY,
        head: [['Item', 'Status', 'Observação']],
        body: renderTopicTable(topic),
        ...tableTheme,
        styles: {
          ...tableTheme.styles,
          fontSize: 8.5,
          cellPadding: 2.2,
          valign: 'top',
        },
        didParseCell: (hookData) => {
          if (hookData.section === 'body' && hookData.column.index === 0) {
            hookData.cell.styles.fontStyle = 'normal';
          }
        },
      });

      currentY = getBackendLastTableY(doc, currentY) + 6;
    };

    if (topicsForPdf.length) {
      topicsForPdf.forEach((topic) => renderTopicSection(topic));
    } else {
      autoTable(doc, {
        startY: currentY,
        head: [['Item', 'Status', 'Observação']],
        body: [],
        ...tableTheme,
      });
    }

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

    const items: ChecklistItemValue[] = [
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
    newChecklist.foto_equipamento =
      this.normalizeChecklistPhotoReference(
        newChecklist.foto_equipamento,
        'Foto do equipamento',
      ) ?? '';
    newChecklist.status = this.deriveChecklistStatus(newChecklist);
    this.assertChecklistExecutionRequirements(newChecklist);
    await this.validateChecklistRelations(newChecklist);
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

    this.logChecklistEvent('checklist_filled_from_template', saved, {
      templateId: template.id,
      status: saved.status,
      itemsCount: Array.isArray(saved.itens) ? saved.itens.length : 0,
    });

    return this.toChecklistResponse(saved);
  }

  async savePdfToStorage(id: string): Promise<{
    fileKey: string;
    folderPath: string;
    fileUrl: string | null;
    url: string | null;
    originalName: string;
    entityId: string;
    hasFinalPdf: true;
    availability: 'ready' | 'registered_without_signed_url';
    message: string;
  }> {
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
      let fileUrl: string | null = null;
      let availability: 'ready' | 'registered_without_signed_url' = 'ready';
      let message = 'PDF final do checklist emitido com sucesso.';

      try {
        fileUrl =
          await this.documentStorageService.getPresignedDownloadUrl(fileKey);
      } catch (urlError) {
        availability = 'registered_without_signed_url';
        message =
          'PDF final emitido e registrado, mas a URL assinada não está disponível no momento.';
        this.logger.warn({
          event: 'checklist_pdf_presigned_url_unavailable',
          checklistId: checklist.id,
          companyId: checklist.company_id,
          requestId: RequestContext.getRequestId(),
          error:
            urlError instanceof Error ? urlError.message : String(urlError),
        });
      }

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

      this.logChecklistEvent('checklist_pdf_finalized', checklist, {
        fileKey,
        folderPath,
        availability,
      });

      return {
        entityId: checklist.id,
        fileKey,
        folderPath,
        originalName: fileName,
        fileUrl,
        url: fileUrl,
        hasFinalPdf: true,
        availability,
        message,
      };
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

  async getPdfAccess(id: string): Promise<ChecklistPdfAccessResponse> {
    const checklist = await this.findOneEntity(id);
    if (!checklist.pdf_file_key) {
      const response: ChecklistPdfAccessResponse = {
        entityId: checklist.id,
        fileKey: null,
        folderPath: null,
        originalName: null,
        url: null,
        hasFinalPdf: false,
        availability: 'not_emitted',
        message: 'O checklist ainda não possui PDF final emitido.',
      };
      this.logChecklistEvent('checklist_pdf_access_checked', checklist, {
        availability: response.availability,
      });
      return response;
    }

    let url: string | null = null;
    let availability: ChecklistPdfAccessAvailability = 'ready';
    let message = 'PDF final do checklist disponível para acesso.';
    try {
      url = await this.documentStorageService.getSignedUrl(
        checklist.pdf_file_key,
      );
      if (!url) {
        availability = 'registered_without_signed_url';
        message =
          'PDF final registrado, mas a URL assinada não está disponível no momento.';
      }
    } catch {
      url = null;
      availability = 'registered_without_signed_url';
      message =
        'PDF final registrado, mas a URL assinada não está disponível no momento.';
    }

    const response: ChecklistPdfAccessResponse = {
      entityId: checklist.id,
      fileKey: checklist.pdf_file_key,
      folderPath: checklist.pdf_folder_path,
      originalName: checklist.pdf_original_name,
      url,
      hasFinalPdf: true,
      availability,
      message,
    };

    this.logChecklistEvent('checklist_pdf_access_checked', checklist, {
      availability: response.availability,
      hasUrl: Boolean(response.url),
    });

    return response;
  }

  async count(options?: { where?: Record<string, unknown> }): Promise<number> {
    const tenantId = this.tenantService.getTenantId();
    const where = options?.where || {};
    const effectiveWhere =
      'deleted_at' in where ? where : { ...where, deleted_at: IsNull() };
    return this.checklistsRepository.count({
      where: tenantId
        ? { ...effectiveWhere, company_id: tenantId }
        : effectiveWhere,
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
        circuitBreaker: this.openAiCircuitBreaker,
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
        tipo_resposta: (item.tipo_resposta ||
          'sim_nao_na') as ChecklistItemValue['tipo_resposta'],
        obrigatorio: item.obrigatorio !== false,
        status: 'ok' as ChecklistItemValue['status'],
        peso: 1,
        observacao: '',
      })) as ChecklistItemValue[],
      is_modelo: true,
      status: 'Pendente',
      data: new Date().toISOString().split('T')[0],
      company_id: tenantId || '',
    });

    const saved = await this.checklistsRepository.save(checklist);
    this.logger.log(
      `Checklist importado do Word salvo como modelo: ${saved.id}`,
    );
    return this.toChecklistResponse(saved);
  }

  /** Validação pública por código de documento (ex.: CHK-2026-XXXXXXXX) */
  async validateByCode(
    code: string,
    companyId: string,
  ): Promise<{
    valid: boolean;
    code?: string;
    message?: string;
  }> {
    const normalized = code.trim().toUpperCase();

    if (!normalized.startsWith('CHK-')) {
      return {
        valid: false,
        message: 'Código inválido ou expirado.',
      };
    }

    const validation = await this.documentRegistryService.validatePublicCode({
      code: normalized,
      companyId,
      expectedModule: 'checklist',
    });

    if (!validation.valid) {
      return {
        valid: false,
        code: normalized,
        message: validation.message,
      };
    }

    return {
      valid: true,
      code: normalized,
    };
  }

  async validateByCodeLegacy(code: string): Promise<{
    valid: boolean;
    code?: string;
    message?: string;
  }> {
    const normalized = code.trim().toUpperCase();
    if (!normalized.startsWith('CHK-')) {
      return {
        valid: false,
        message: 'Código inválido ou expirado.',
      };
    }

    return this.documentRegistryService.validateLegacyPublicCode({
      code: normalized,
      expectedModule: 'checklist',
    });
  }
}
