import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { NonConformity } from '../entities/nonconformity.entity';
import { NcStatus } from '../nonconformities.service';
import { TenantService } from '../../../shared/tenant/tenant.service';
import { resolveSiteAccessScopeFromTenantService } from '../../../shared/tenant/site-access-scope.util';
import { DocumentStorageService } from '../../../shared/services/document-storage.service';
import { StorageService } from '../../../shared/services/storage.service';
import { PdfService } from '../../../shared/services/pdf.service';
import { DocumentGovernanceService } from '../../document-registry/document-governance.service';
import { cleanupUploadedFile } from '../../../shared/storage/storage-compensation.util';
import {
  coerceDocumentDate,
  getIsoWeekNumber,
} from '../../../shared/utils/document-calendar.util';
import {
  GovernedPdfAccessAvailability,
  GovernedPdfAccessResponseDto,
} from '../../../shared/dto/governed-pdf-access-response.dto';

export type NcPdfAccessAvailability = GovernedPdfAccessAvailability;
type NcPdfAccessResponse = GovernedPdfAccessResponseDto;

type GovernedAttachmentReferencePayload = {
  v: 1;
  kind: 'governed-storage';
  fileKey: string;
  originalName: string;
  mimeType: string;
  uploadedAt: string;
  sizeBytes?: number | null;
};

const GOVERNED_ATTACHMENT_REF_PREFIX = 'gst:nc-attachment:';
const MAX_EMBEDDED_PHOTOS = 12;

@Injectable()
export class NonConformitiesPdfService {
  private readonly logger = new Logger(NonConformitiesPdfService.name);

  constructor(
    @InjectRepository(NonConformity)
    private readonly nonConformitiesRepository: Repository<NonConformity>,
    private readonly tenantService: TenantService,
    private readonly documentStorageService: DocumentStorageService,
    private readonly storageService: StorageService,
    private readonly pdfService: PdfService,
    private readonly documentGovernanceService: DocumentGovernanceService,
  ) {}

  private async findOneEntity(id: string): Promise<NonConformity> {
    const scope = resolveSiteAccessScopeFromTenantService(
      this.tenantService,
      'nao conformidades',
    );
    const nc = await this.nonConformitiesRepository.findOne({
      where: {
        id,
        company_id: scope.companyId,
        deleted_at: IsNull(),
        ...(!scope.hasCompanyWideAccess ? { site_id: scope.siteId } : {}),
      },
      relations: ['site', 'company'],
    });

    if (!nc) {
      throw new NotFoundException(
        `Não conformidade com ID ${id} não encontrada`,
      );
    }

    return nc;
  }

  private normalizeStatus(value?: string | null): NcStatus {
    const known = Object.values(NcStatus);
    return known.includes(value as NcStatus)
      ? (value as NcStatus)
      : NcStatus.ABERTA;
  }

  async getPdfAccess(id: string): Promise<NcPdfAccessResponse> {
    const nc = await this.findOneEntity(id);
    if (!nc.pdf_file_key) {
      return {
        entityId: nc.id,
        hasFinalPdf: false,
        availability: 'not_emitted',
        message: 'PDF final ainda não foi emitido para esta não conformidade.',
        fileKey: null,
        folderPath: null,
        originalName: null,
        url: null,
      };
    }

    try {
      const url = await this.documentStorageService.getSignedUrl(
        nc.pdf_file_key,
      );
      return {
        entityId: nc.id,
        hasFinalPdf: true,
        availability: 'ready',
        fileKey: nc.pdf_file_key,
        folderPath: nc.pdf_folder_path || null,
        originalName: nc.pdf_original_name || null,
        url,
        message: null,
      };
    } catch (error) {
      this.logger.warn(
        `Falha ao obter URL assinada do PDF final da NC ${id}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return {
        entityId: nc.id,
        hasFinalPdf: true,
        availability: 'registered_without_signed_url',
        fileKey: nc.pdf_file_key,
        folderPath: nc.pdf_folder_path || null,
        originalName: nc.pdf_original_name || null,
        url: null,
        message:
          'PDF final registrado, mas a URL segura do storage não está disponível no momento.',
      };
    }
  }

  async generateFinalPdf(
    id: string,
    userId?: string,
  ): Promise<NcPdfAccessResponse & { generated: boolean }> {
    const nc = await this.findOneEntity(id);
    const status = this.normalizeStatus(nc.status);

    if (status === NcStatus.ENCERRADA && nc.pdf_file_key) {
      return { ...(await this.getPdfAccess(id)), generated: false };
    }

    const documentCode = this.buildNcDocumentCode(nc);
    const verificationCode =
      nc.verification_code ||
      `NC-${randomBytes(5).toString('hex').toUpperCase()}`;
    const generatedAt = new Date();

    let logoUrl: string | null = null;
    if (nc.company?.logo_storage_key) {
      try {
        logoUrl = await this.storageService.getPresignedInlineViewUrl(
          nc.company.logo_storage_key,
        );
      } catch {
        this.logger.warn(
          `Falha ao resolver logo da empresa para PDF da NC ${id}`,
        );
      }
    }

    const images = await this.resolveEmbeddablePhotos(nc);

    const html = this.renderNcFinalPdfHtml({
      nc,
      documentCode,
      logoUrl,
      images,
      authenticity: {
        verificationCode,
        generatedAt,
        hashLabel: 'Calculado e registrado após a emissão',
      },
    });

    const buffer = await this.pdfService.generateFromHtml(html, {
      format: 'A4',
      landscape: false,
      preferCssPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: this.buildFooterTemplate({ documentCode, generatedAt }),
      margin: { top: '0mm', right: '0mm', bottom: '8mm', left: '0mm' },
    });

    const originalName = this.buildFinalPdfOriginalName(nc);
    const previousFileKey = nc.pdf_file_key || null;
    const isFirstEmission = !previousFileKey;

    // O document_registry compartilhado (usado por APR/PT/DDS/etc.) trava
    // qualquer documento após o primeiro registro: `finalized_at` é setado
    // na primeira chamada e uma segunda chamada de registerFinalDocument
    // para a mesma (empresa, módulo, entidade) é sempre rejeitada — proteção
    // deliberada contra alteração silenciosa de documento já finalizado.
    // Por isso só a PRIMEIRA emissão passa pela governança completa
    // (document_registry + trilha forense + integridade de hash).
    // Regenerações subsequentes (permitidas enquanto a NC não está
    // Encerrada) só atualizam as colunas de PDF da própria NC — sem criar
    // novo registro na governança, que continua apontando para a versão
    // originalmente finalizada.
    if (isFirstEmission) {
      await this.storeFinalPdfBuffer(nc, {
        buffer,
        originalName,
        mimeType: 'application/pdf',
        userId,
        verificationCode,
        generatedAt,
        documentCode,
      });
    } else {
      await this.replaceFinalPdfBuffer(nc, {
        buffer,
        originalName,
        mimeType: 'application/pdf',
        verificationCode,
        generatedAt,
      });
    }

    if (previousFileKey) {
      try {
        await this.documentStorageService.deleteFile(previousFileKey);
      } catch (error) {
        this.logger.warn(
          `Falha ao remover PDF anterior da NC ${id} (${previousFileKey}) após regeneração: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }

    return { ...(await this.getPdfAccess(id)), generated: true };
  }

  private async storeFinalPdfBuffer(
    nc: NonConformity,
    input: {
      buffer: Buffer;
      originalName: string;
      mimeType: string;
      userId?: string;
      verificationCode: string;
      generatedAt: Date;
      documentCode: string;
    },
  ): Promise<{ fileKey: string; folderPath: string; originalName: string }> {
    const documentDate =
      coerceDocumentDate(nc.data_identificacao) || new Date();
    const year = documentDate.getFullYear();
    const week = String(getIsoWeekNumber(documentDate) || 1).padStart(2, '0');

    const fileKey = this.documentStorageService.generateDocumentKey(
      nc.company_id,
      'nonconformities',
      nc.id,
      input.originalName,
      {
        folderSegments: [
          ...(nc.site_id ? ['sites', nc.site_id] : []),
          String(year),
          `week-${week}`,
        ],
      },
    );
    const folderPath = fileKey.split('/').slice(0, -1).join('/');

    await this.documentStorageService.uploadFile(
      fileKey,
      input.buffer,
      input.mimeType,
    );

    try {
      await this.documentGovernanceService.registerFinalDocument({
        companyId: nc.company_id,
        module: 'nonconformity',
        entityId: nc.id,
        title: nc.codigo_nc || nc.tipo || 'Não Conformidade',
        documentDate,
        documentCode: input.documentCode,
        fileKey,
        folderPath,
        originalName: input.originalName,
        mimeType: input.mimeType,
        createdBy: input.userId,
        fileBuffer: input.buffer,
        persistEntityMetadata: async (manager, computedHash) => {
          await manager.getRepository(NonConformity).update(
            { id: nc.id },
            {
              pdf_file_key: fileKey,
              pdf_folder_path: folderPath,
              pdf_original_name: input.originalName,
              final_pdf_hash_sha256: computedHash,
              verification_code: input.verificationCode,
              pdf_generated_at: input.generatedAt,
            },
          );
        },
      });
    } catch (error) {
      await cleanupUploadedFile(
        this.logger,
        `nonconformity:${nc.id}`,
        fileKey,
        (key) => this.documentStorageService.deleteFile(key),
      );
      throw error;
    }

    return { fileKey, folderPath, originalName: input.originalName };
  }

  /**
   * Regenera o PDF de uma NC que já teve a primeira emissão governada
   * (document_registry já tem `finalized_at`). Não chama
   * DocumentGovernanceService.registerFinalDocument de novo — o registry
   * rejeitaria com "Documento finalizado/assinado não pode ser alterado
   * silenciosamente" — apenas troca o arquivo no storage e atualiza as
   * colunas de PDF da própria NC. O registro de governança continua
   * apontando para a versão originalmente finalizada.
   */
  private async replaceFinalPdfBuffer(
    nc: NonConformity,
    input: {
      buffer: Buffer;
      originalName: string;
      mimeType: string;
      verificationCode: string;
      generatedAt: Date;
    },
  ): Promise<{ fileKey: string; folderPath: string; originalName: string }> {
    const documentDate =
      coerceDocumentDate(nc.data_identificacao) || new Date();
    const year = documentDate.getFullYear();
    const week = String(getIsoWeekNumber(documentDate) || 1).padStart(2, '0');

    const fileKey = this.documentStorageService.generateDocumentKey(
      nc.company_id,
      'nonconformities',
      nc.id,
      input.originalName,
      {
        folderSegments: [
          ...(nc.site_id ? ['sites', nc.site_id] : []),
          String(year),
          `week-${week}`,
        ],
      },
    );
    const folderPath = fileKey.split('/').slice(0, -1).join('/');

    await this.documentStorageService.uploadFile(
      fileKey,
      input.buffer,
      input.mimeType,
    );

    try {
      const hash = this.pdfService.computeHash(input.buffer);
      await this.nonConformitiesRepository.update(
        { id: nc.id },
        {
          pdf_file_key: fileKey,
          pdf_folder_path: folderPath,
          pdf_original_name: input.originalName,
          final_pdf_hash_sha256: hash,
          verification_code: input.verificationCode,
          pdf_generated_at: input.generatedAt,
        },
      );
    } catch (error) {
      await cleanupUploadedFile(
        this.logger,
        `nonconformity:${nc.id}`,
        fileKey,
        (key) => this.documentStorageService.deleteFile(key),
      );
      throw error;
    }

    return { fileKey, folderPath, originalName: input.originalName };
  }

  private buildNcDocumentCode(
    nc: Pick<NonConformity, 'id' | 'data_identificacao' | 'created_at'>,
  ): string {
    const documentDate =
      coerceDocumentDate(nc.data_identificacao) ||
      coerceDocumentDate(nc.created_at) ||
      new Date();
    const year = documentDate.getFullYear();
    const week = String(getIsoWeekNumber(documentDate) || 1).padStart(2, '0');
    return `NONCONFORMITY-${year}-${week}-${nc.id.slice(0, 8).toUpperCase()}`;
  }

  private buildFinalPdfOriginalName(
    nc: Pick<NonConformity, 'codigo_nc' | 'id'>,
  ): string {
    const reference = String(nc.codigo_nc || nc.id || 'nc')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return `${reference || 'nc'}.pdf`;
  }

  /**
   * Resolve fotos incorporáveis dos anexos da NC como data URIs base64.
   *
   * Segurança: NUNCA busca URL externa arbitrária (o Puppeteer já bloqueia
   * requisições de rede em `PdfService`, isto é defesa em profundidade contra
   * SSRF). Só duas origens são consideradas seguras para incorporação:
   *  - `data:image/...` já embutido pelo cliente (captura de câmera);
   *  - referência de anexo governado (`gst:nc-attachment:...`) cujo fileKey
   *    aponta para o storage interno do próprio tenant — baixado via
   *    downloadFileBuffer, com o prefixo `documents/{companyId}/` conferido
   *    antes do download.
   * Qualquer outra URL manual (http/https digitado pelo usuário) é ignorada
   * na incorporação e listada apenas como texto no PDF.
   */
  private async resolveEmbeddablePhotos(
    nc: Pick<NonConformity, 'anexos' | 'company_id'>,
  ): Promise<Array<{ dataUri: string; label: string }>> {
    const entries = (nc.anexos || []).slice(0, MAX_EMBEDDED_PHOTOS * 2);
    const images: Array<{ dataUri: string; label: string }> = [];

    for (const entry of entries) {
      if (images.length >= MAX_EMBEDDED_PHOTOS) {
        break;
      }

      if (/^data:image\/(?:png|jpe?g|webp);base64,/i.test(entry)) {
        images.push({ dataUri: entry, label: 'Foto anexada' });
        continue;
      }

      const governed = this.parseGovernedAttachmentReference(entry);
      if (!governed || !governed.mimeType.startsWith('image/')) {
        continue;
      }
      if (!governed.fileKey.startsWith(`documents/${nc.company_id}/`)) {
        continue;
      }

      try {
        const buffer = await this.documentStorageService.downloadFileBuffer(
          governed.fileKey,
        );
        images.push({
          dataUri: `data:${governed.mimeType};base64,${buffer.toString('base64')}`,
          label: governed.originalName || 'Anexo governado',
        });
      } catch (error) {
        this.logger.warn(
          `Falha ao incorporar anexo governado no PDF (${governed.fileKey}): ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }

    return images;
  }

  private parseGovernedAttachmentReference(
    value?: string | null,
  ): GovernedAttachmentReferencePayload | null {
    if (!value || !value.startsWith(GOVERNED_ATTACHMENT_REF_PREFIX)) {
      return null;
    }
    try {
      const encoded = value.slice(GOVERNED_ATTACHMENT_REF_PREFIX.length);
      const parsed = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as GovernedAttachmentReferencePayload;
      if (
        parsed?.v !== 1 ||
        parsed?.kind !== 'governed-storage' ||
        typeof parsed.fileKey !== 'string' ||
        typeof parsed.mimeType !== 'string'
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private escapeHtml(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    const str =
      value instanceof Date
        ? value.toISOString()
        : typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
          ? String(value)
          : '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private formatDisplayDate(
    value?: Date | string | null,
    fallback = '-',
  ): string {
    if (!value) return fallback;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return fallback;
    return parsed.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  }

  private formatDisplayDateTime(
    value?: Date | string | null,
    fallback = '-',
  ): string {
    if (!value) return fallback;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return fallback;
    return parsed.toLocaleString('pt-BR', { timeZone: 'UTC' });
  }

  private textOr(value?: string | null, fallback = '-'): string {
    const trimmed = String(value ?? '').trim();
    return trimmed ? trimmed : fallback;
  }

  private buildFooterTemplate(input: {
    documentCode: string;
    generatedAt: Date;
  }): string {
    return `
      <div style="width: 100%; font-size: 8px; color: #355070; padding: 0 12mm; box-sizing: border-box; font-family: Arial, sans-serif;">
        <div style="border-top: 1px solid #dbe7f2; padding-top: 4px; display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <span>Não Conformidade &middot; Código ${this.escapeHtml(input.documentCode)}</span>
          <span>Gerado em ${this.escapeHtml(this.formatDisplayDateTime(input.generatedAt))} &middot; Pág. <span class="pageNumber"></span> de <span class="totalPages"></span></span>
        </div>
      </div>
    `;
  }

  private renderNcFinalPdfHtml(input: {
    nc: NonConformity;
    documentCode: string;
    logoUrl: string | null;
    images: Array<{ dataUri: string; label: string }>;
    authenticity: {
      verificationCode: string;
      generatedAt: Date;
      hashLabel: string;
    };
  }): string {
    const { nc, documentCode, logoUrl, images, authenticity } = input;
    const esc = (v: unknown) => this.escapeHtml(v);

    const metaField = (label: string, value: string) => `
      <div class="meta-field">
        <span class="meta-label">${esc(label)}</span>
        <span class="meta-value">${esc(value)}</span>
      </div>
    `;

    const narrative = (title: string, content?: string | null) => `
      <section class="narrative">
        <h3>${esc(title)}</h3>
        <p>${esc(this.textOr(content))}</p>
      </section>
    `;

    const listOrDash = (values?: string[] | null) =>
      values && values.length > 0 ? values.join(', ') : '-';

    const actionsRows: string[] = [];
    if (nc.acao_imediata_descricao) {
      actionsRows.push(`
        <tr>
          <td>Imediata</td>
          <td>${esc(nc.acao_imediata_descricao)}</td>
          <td>${esc(this.textOr(nc.acao_imediata_responsavel))}</td>
          <td>${esc(this.formatDisplayDate(nc.acao_imediata_data))}</td>
          <td>${esc(this.textOr(nc.acao_imediata_status, 'Pendente'))}</td>
        </tr>
      `);
    }
    if (nc.acao_definitiva_descricao) {
      actionsRows.push(`
        <tr>
          <td>Definitiva</td>
          <td>${esc(nc.acao_definitiva_descricao)}</td>
          <td>${esc(this.textOr(nc.acao_definitiva_responsavel))}</td>
          <td>${esc(this.formatDisplayDate(nc.acao_definitiva_prazo || nc.acao_definitiva_data_prevista))}</td>
          <td>${esc(nc.status)}</td>
        </tr>
      `);
    }
    const preventivaItens = [
      nc.acao_preventiva_medidas,
      nc.acao_preventiva_treinamento,
      nc.acao_preventiva_revisao_procedimento,
      nc.acao_preventiva_melhoria_processo,
      nc.acao_preventiva_epc_epi,
    ].filter(Boolean);
    if (preventivaItens.length > 0) {
      actionsRows.push(`
        <tr>
          <td>Preventiva</td>
          <td>${esc(preventivaItens.join(' | '))}</td>
          <td>-</td>
          <td>-</td>
          <td>-</td>
        </tr>
      `);
    }

    const photosHtml =
      images.length > 0
        ? `
          <section class="narrative">
            <h3>Fotos e evidências anexadas</h3>
            <div class="photo-grid">
              ${images
                .map(
                  (img) => `
                <figure class="photo-item">
                  <img src="${esc(img.dataUri)}" alt="${esc(img.label)}" />
                  <figcaption>${esc(img.label)}</figcaption>
                </figure>
              `,
                )
                .join('')}
            </div>
          </section>
        `
        : '';

    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <style>
            @page { margin: 0; }
            * { box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; color: #1a2b3c; margin: 0; padding: 14mm 12mm; font-size: 11px; }
            h1 { font-size: 18px; margin: 0 0 2px; color: #1a2b3c; }
            h2 { font-size: 13px; margin: 18px 0 8px; color: #355070; border-bottom: 1px solid #dbe7f2; padding-bottom: 4px; }
            h3 { font-size: 11.5px; margin: 0 0 4px; color: #355070; }
            p { margin: 0; line-height: 1.5; white-space: pre-wrap; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #355070; padding-bottom: 10px; margin-bottom: 14px; }
            .header img { max-height: 40px; max-width: 160px; object-fit: contain; }
            .header-title p.subtitle { color: #5c7893; font-size: 10px; margin-top: 2px; }
            .header-code { text-align: right; font-size: 10px; color: #5c7893; }
            .header-code strong { display: block; font-size: 13px; color: #1a2b3c; }
            .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; margin-bottom: 6px; }
            .meta-field { display: flex; justify-content: space-between; border-bottom: 1px dotted #dbe7f2; padding: 3px 0; }
            .meta-label { color: #5c7893; font-weight: bold; }
            .meta-value { text-align: right; }
            .narrative { margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
            th, td { border: 1px solid #dbe7f2; padding: 5px 6px; font-size: 10px; text-align: left; vertical-align: top; }
            th { background: #f2f6fa; color: #355070; }
            .photo-grid { display: flex; flex-wrap: wrap; gap: 8px; }
            .photo-item { width: 31%; margin: 0; border: 1px solid #dbe7f2; padding: 4px; border-radius: 4px; }
            .photo-item img { width: 100%; height: 90px; object-fit: cover; border-radius: 2px; }
            .photo-item figcaption { font-size: 8px; color: #5c7893; margin-top: 2px; text-align: center; }
            .authenticity { margin-top: 18px; border: 1px solid #dbe7f2; border-radius: 6px; padding: 10px 12px; background: #f8fafc; font-size: 9.5px; color: #5c7893; }
            .authenticity strong { color: #1a2b3c; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-title">
              ${logoUrl ? `<img src="${esc(logoUrl)}" alt="Logo" />` : ''}
              <h1>RELATÓRIO DE NÃO CONFORMIDADE</h1>
              <p class="subtitle">Documento oficial de registro, tratativa e encerramento de desvio</p>
            </div>
            <div class="header-code">
              <strong>${esc(documentCode)}</strong>
              Status: ${esc(nc.status)}<br />
              ${esc(this.formatDisplayDate(nc.data_identificacao))}
            </div>
          </div>

          <h2>Identificação</h2>
          <div class="meta-grid">
            ${metaField('Código', this.textOr(nc.codigo_nc))}
            ${metaField('Tipo', this.textOr(nc.tipo))}
            ${metaField('Data de identificação', this.formatDisplayDate(nc.data_identificacao))}
            ${metaField('Local/Setor/Área', this.textOr(nc.local_setor_area))}
            ${metaField('Atividade envolvida', this.textOr(nc.atividade_envolvida))}
            ${metaField('Responsável pela área', this.textOr(nc.responsavel_area))}
            ${metaField('Auditor/Técnico responsável', this.textOr(nc.auditor_responsavel))}
            ${metaField('Classificação', listOrDash(nc.classificacao))}
          </div>

          <h2>Descrição do desvio</h2>
          ${narrative('Descrição', nc.descricao)}
          ${narrative('Evidência observada', nc.evidencia_observada)}
          ${narrative('Condição insegura', nc.condicao_insegura)}
          ${nc.ato_inseguro ? narrative('Ato inseguro', nc.ato_inseguro) : ''}

          <h2>Requisito e classificação de risco</h2>
          <div class="meta-grid">
            ${metaField('Norma regulamentadora (NR)', this.textOr(nc.requisito_nr))}
            ${metaField('Item do requisito', this.textOr(nc.requisito_item))}
            ${metaField('Procedimento', this.textOr(nc.requisito_procedimento))}
            ${metaField('Política', this.textOr(nc.requisito_politica))}
            ${metaField('Perigo', this.textOr(nc.risco_perigo))}
            ${metaField('Risco associado', this.textOr(nc.risco_associado))}
            ${metaField('Consequências', listOrDash(nc.risco_consequencias))}
            ${metaField('Nível de risco', this.textOr(nc.risco_nivel))}
            ${metaField('Causa', listOrDash(nc.causa))}
            ${metaField('Causa (outro)', this.textOr(nc.causa_outro))}
          </div>

          ${
            actionsRows.length > 0
              ? `
            <h2>Plano de ação</h2>
            <table>
              <thead>
                <tr><th>Tipo</th><th>Descrição</th><th>Responsável</th><th>Prazo</th><th>Status</th></tr>
              </thead>
              <tbody>
                ${actionsRows.join('')}
              </tbody>
            </table>
          `
              : ''
          }

          <h2>Verificação e encerramento</h2>
          <div class="meta-grid">
            ${metaField('Resultado da verificação', this.textOr(nc.verificacao_resultado))}
            ${metaField('Responsável pela verificação', this.textOr(nc.verificacao_responsavel))}
            ${metaField('Data da verificação', this.formatDisplayDate(nc.verificacao_data))}
          </div>
          ${nc.verificacao_evidencias ? narrative('Evidências da verificação', nc.verificacao_evidencias) : ''}
          ${nc.observacoes_gerais ? narrative('Observações gerais', nc.observacoes_gerais) : ''}

          ${photosHtml}

          <h2>Responsáveis e assinaturas</h2>
          <div class="meta-grid">
            ${metaField('Responsável da área', this.textOr(nc.assinatura_responsavel_area, this.textOr(nc.responsavel_area)))}
            ${metaField('Técnico/Auditor', this.textOr(nc.assinatura_tecnico_auditor, this.textOr(nc.auditor_responsavel)))}
            ${metaField('Gestão', this.textOr(nc.assinatura_gestao))}
          </div>

          <div class="authenticity">
            <strong>Governança e autenticidade</strong><br />
            Código do documento: <strong>${esc(documentCode)}</strong> &middot;
            Código de verificação: <strong>${esc(authenticity.verificationCode)}</strong><br />
            Hash SHA-256: ${esc(authenticity.hashLabel)}<br />
            Emitido em ${esc(this.formatDisplayDateTime(authenticity.generatedAt))}. Valide a autenticidade deste documento no portal público do SGS.
          </div>
        </body>
      </html>
    `;
  }
}
