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
      <div style="width: 100%; font-size: 7.3pt; color: #374151; padding: 0 16mm; box-sizing: border-box; font-family: Arial, Helvetica, sans-serif;">
        <div style="border-top: 0.25mm solid #D3DCE6; padding-top: 1.6mm; display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
          <div>
            <div style="font-weight: 700;">SGS &mdash; Sistema de Gestão de Segurança</div>
            <div>Gerado em ${this.escapeHtml(this.formatDisplayDateTime(input.generatedAt))}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 700;">ID: ${this.escapeHtml(input.documentCode)}</div>
            <div>Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Paleta e tipografia espelham os tokens do design system de PDF do SGS
   * (frontend/src/lib/pdf-system/tokens — pdfColors/visualTokens/pdfTypography)
   * usado por APR/PT/DDS/Checklist, para o PDF da NC ficar visualmente
   * consistente com os demais documentos oficiais do sistema.
   */
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

    const gridField = (label: string, value: string) => `
      <div class="grid-field">
        <div class="label">${esc(label)}</div>
        <div class="value">${esc(value)}</div>
      </div>
    `;

    const narrativeCard = (title: string, content?: string | null) => `
      <div class="card">
        <div class="card-title-strip">${esc(title)}</div>
        <div class="card-body"><p>${esc(this.textOr(content))}</p></div>
      </div>
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
          <div class="section-title"><span class="bar"></span><h2>Fotos e evidências anexadas</h2></div>
          <div class="card">
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
          </div>
        `
        : '';

    const signRow = (role: string, name?: string | null) => `
      <div class="sign-row">
        <div class="role">${esc(role)}</div>
        <div class="name">${esc(this.textOr(name))}</div>
      </div>
    `;

    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <style>
            @page { margin: 0; }
            * { box-sizing: border-box; }
            :root {
              --brand: #18517C;
              --brand-strong: #0F2036;
              --brand-on: #FFFFFF;
              --info: #1865B0;
              --ink: #111827;
              --text-secondary: #374151;
              --text-muted: #6B7280;
              --border: #D3DCE6;
              --border-strong: #8694A6;
              --surface: #FFFFFF;
              --surface-muted: #EEF3F8;
              --page-bg: #F6F8FB;
              --success: #1B5E3E;
            }
            body { margin: 0; background: var(--page-bg); color: var(--ink); font-family: Arial, Helvetica, sans-serif; font-size: 9.2pt; line-height: 1.45; }
            h1, h2, h3, p { margin: 0; }
            .page-content { padding: 0 16mm 8mm; }

            .header-band { background: var(--brand); padding: 6mm 16mm 5mm; display: flex; align-items: flex-start; justify-content: space-between; border-bottom: 1.4mm solid var(--brand-strong); }
            .header-left { display: flex; align-items: flex-start; gap: 5mm; }
            .header-logo { max-width: 30mm; max-height: 16mm; object-fit: contain; background: #fff; border-radius: 1.5mm; padding: 1.5mm; }
            .header-title h1 { font-size: 15.2pt; color: var(--brand-on); font-weight: 700; letter-spacing: .01em; text-transform: uppercase; }
            .header-title p { font-size: 9pt; color: #DFE7EF; margin-top: 1.6mm; }
            .header-code-box { background: var(--surface); border: 0.35mm solid var(--border-strong); border-radius: 2.8mm; min-width: 46mm; overflow: hidden; }
            .header-code-label { background: var(--info); color: #fff; font-size: 7pt; font-weight: 700; text-align: center; padding: 1.3mm 2mm; letter-spacing: .04em; text-transform: uppercase; }
            .header-code-value { text-align: center; font-weight: 700; font-size: 9.5pt; color: var(--ink); padding: 2.2mm 3mm 1mm; }
            .header-code-status { text-align: center; font-size: 7pt; color: var(--text-secondary); padding: 0 3mm 2.2mm; }

            .meta-cards { display: flex; gap: 2.4mm; padding: 4mm 16mm 0; }
            .meta-card { flex: 1; background: var(--surface); border: 0.3mm solid var(--border); border-radius: 2.8mm; padding: 2.6mm 3.2mm 2.6mm 4.2mm; position: relative; overflow: hidden; }
            .meta-card::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 2.2mm; background: var(--brand); }
            .meta-card .label { font-size: 7pt; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .03em; }
            .meta-card .value { font-size: 9.2pt; font-weight: 700; color: var(--ink); margin-top: 1mm; }

            .section-title { display: flex; align-items: center; gap: 2mm; margin: 7mm 0 3mm; }
            .section-title .bar { width: 2.4mm; height: 5.5mm; background: var(--brand); border-radius: 1mm; display: inline-block; }
            .section-title h2 { font-size: 9.5pt; font-weight: 700; color: var(--ink); text-transform: uppercase; letter-spacing: .02em; }

            .card { background: var(--surface); border: 0.3mm solid var(--border); border-radius: 2.8mm; position: relative; overflow: hidden; margin-bottom: 4mm; }
            .card::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 2.4mm; background: var(--brand); }
            .card-title-strip { background: var(--surface-muted); margin: 1.2mm 1.2mm 0; border-radius: 1.6mm 1.6mm 0 0; padding: 2mm 4mm 2mm 5.5mm; font-size: 9.5pt; font-weight: 700; color: var(--ink); }
            .card-body { padding: 3mm 4mm 3.5mm 5.5mm; }
            .card-body p { white-space: pre-wrap; font-size: 9.2pt; color: var(--ink); }

            .grid-2 { display: grid; grid-template-columns: 1fr 1fr; margin-left: 1.2mm; }
            .grid-field { padding: 2.6mm 3mm 2.6mm 4.3mm; border-top: 0.25mm solid var(--border); }
            .grid-field:nth-child(-n+2) { border-top: 0; }
            .grid-field:nth-child(odd) { border-right: 0.25mm solid var(--border); }
            .grid-field .label { font-size: 7pt; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .02em; }
            .grid-field .value { font-size: 9.2pt; color: var(--ink); margin-top: 0.8mm; }

            table.plan-table { width: 100%; border-collapse: collapse; }
            .plan-table th { background: var(--surface-muted); color: var(--text-secondary); font-size: 7.3pt; text-transform: uppercase; letter-spacing: .02em; text-align: left; padding: 2.2mm 3mm; border: 0.25mm solid var(--border); }
            .plan-table td { border: 0.25mm solid var(--border); padding: 2.2mm 3mm; font-size: 8.8pt; color: var(--ink); vertical-align: top; }

            .photo-grid { display: flex; flex-wrap: wrap; gap: 3mm; padding: 3mm 4mm 3.5mm 5.5mm; }
            .photo-item { width: 29%; border: 0.3mm solid var(--border); border-radius: 2mm; padding: 1.5mm; background: #fff; }
            .photo-item img { width: 100%; height: 26mm; object-fit: cover; border-radius: 1mm; }
            .photo-item figcaption { font-size: 6.8pt; color: var(--text-muted); text-align: center; margin-top: 1mm; }

            .gov-card { background: var(--surface); border: 0.35mm solid var(--border-strong); border-radius: 2.8mm; position: relative; overflow: hidden; margin-top: 2mm; }
            .gov-card::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 2.5mm; background: var(--brand); }
            .gov-title { font-size: 9.5pt; font-weight: 700; color: var(--ink); padding: 3mm 4mm 0 5.5mm; }
            .gov-body { display: flex; gap: 3mm; padding: 3mm 4mm 4mm 5.5mm; }
            .sign-panel { flex: 1; }
            .sign-row { background: #fff; border: 0.25mm solid var(--border); border-radius: 1.6mm; padding: 2mm 3mm; margin-bottom: 2mm; }
            .sign-row .role { font-size: 7pt; font-weight: 700; color: var(--text-muted); text-transform: uppercase; }
            .sign-row .name { font-size: 8.8pt; font-weight: 700; color: var(--ink); margin-top: 0.6mm; }
            .auth-panel { width: 68mm; background: var(--surface-muted); border: 0.25mm solid var(--border); border-radius: 1.8mm; padding: 2.6mm 3mm; position: relative; }
            .auth-panel .heading { font-size: 7pt; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 1.8mm; }
            .auth-panel .code { font-size: 8.8pt; font-weight: 700; color: var(--ink); margin-top: 1mm; }
            .auth-panel .hash { font-size: 6.8pt; color: var(--text-muted); margin-top: 1.5mm; word-break: break-all; }
            .badge-valid { position: absolute; right: 2.6mm; bottom: 2.6mm; background: var(--success); color: #fff; font-size: 7pt; font-weight: 700; border-radius: 1.5mm; padding: 1mm 2.6mm; }
          </style>
        </head>
        <body>
          <div class="header-band">
            <div class="header-left">
              ${logoUrl ? `<img class="header-logo" src="${esc(logoUrl)}" alt="Logo" />` : ''}
              <div class="header-title">
                <h1>Relatório de Não Conformidade</h1>
                <p>Documento oficial de registro, tratativa e encerramento de desvio</p>
              </div>
            </div>
            <div class="header-code-box">
              <div class="header-code-label">Identificador</div>
              <div class="header-code-value">${esc(documentCode)}</div>
              <div class="header-code-status">Status: ${esc(nc.status)}</div>
            </div>
          </div>

          <div class="meta-cards">
            <div class="meta-card"><div class="label">Empresa</div><div class="value">${esc(this.textOr(nc.company?.razao_social))}</div></div>
            <div class="meta-card"><div class="label">Local/Setor</div><div class="value">${esc(this.textOr(nc.local_setor_area))}</div></div>
            <div class="meta-card"><div class="label">Data de identificação</div><div class="value">${esc(this.formatDisplayDate(nc.data_identificacao))}</div></div>
          </div>

          <div class="page-content">
            <div class="section-title"><span class="bar"></span><h2>Identificação</h2></div>
            <div class="card">
              <div class="grid-2">
                ${gridField('Código', this.textOr(nc.codigo_nc))}
                ${gridField('Tipo', this.textOr(nc.tipo))}
                ${gridField('Atividade envolvida', this.textOr(nc.atividade_envolvida))}
                ${gridField('Responsável pela área', this.textOr(nc.responsavel_area))}
                ${gridField('Auditor/Técnico responsável', this.textOr(nc.auditor_responsavel))}
                ${gridField('Classificação', listOrDash(nc.classificacao))}
              </div>
            </div>

            <div class="section-title"><span class="bar"></span><h2>Descrição do desvio</h2></div>
            ${narrativeCard('Descrição', nc.descricao)}
            ${narrativeCard('Evidência observada', nc.evidencia_observada)}
            ${narrativeCard('Condição insegura', nc.condicao_insegura)}
            ${nc.ato_inseguro ? narrativeCard('Ato inseguro', nc.ato_inseguro) : ''}

            <div class="section-title"><span class="bar"></span><h2>Requisito e classificação de risco</h2></div>
            <div class="card">
              <div class="grid-2">
                ${gridField('Norma regulamentadora (NR)', this.textOr(nc.requisito_nr))}
                ${gridField('Item do requisito', this.textOr(nc.requisito_item))}
                ${gridField('Procedimento', this.textOr(nc.requisito_procedimento))}
                ${gridField('Política', this.textOr(nc.requisito_politica))}
                ${gridField('Perigo', this.textOr(nc.risco_perigo))}
                ${gridField('Risco associado', this.textOr(nc.risco_associado))}
                ${gridField('Consequências', listOrDash(nc.risco_consequencias))}
                ${gridField('Nível de risco', this.textOr(nc.risco_nivel))}
                ${gridField('Causa', listOrDash(nc.causa))}
                ${gridField('Causa (outro)', this.textOr(nc.causa_outro))}
              </div>
            </div>

            ${
              actionsRows.length > 0
                ? `
              <div class="section-title"><span class="bar"></span><h2>Plano de ação</h2></div>
              <table class="plan-table">
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

            <div class="section-title"><span class="bar"></span><h2>Verificação e encerramento</h2></div>
            <div class="card">
              <div class="grid-2">
                ${gridField('Resultado da verificação', this.textOr(nc.verificacao_resultado))}
                ${gridField('Responsável pela verificação', this.textOr(nc.verificacao_responsavel))}
                ${gridField('Data da verificação', this.formatDisplayDate(nc.verificacao_data))}
              </div>
            </div>
            ${nc.verificacao_evidencias ? narrativeCard('Evidências da verificação', nc.verificacao_evidencias) : ''}
            ${nc.observacoes_gerais ? narrativeCard('Observações gerais', nc.observacoes_gerais) : ''}

            ${photosHtml}

            <div class="section-title"><span class="bar"></span><h2>Governança, autenticidade e rastreabilidade</h2></div>
            <div class="gov-card">
              <div class="gov-body">
                <div class="sign-panel">
                  ${signRow('Responsável da área', nc.assinatura_responsavel_area || nc.responsavel_area)}
                  ${signRow('Técnico/Auditor', nc.assinatura_tecnico_auditor || nc.auditor_responsavel)}
                  ${signRow('Gestão', nc.assinatura_gestao)}
                </div>
                <div class="auth-panel">
                  <div class="heading">Autenticidade</div>
                  <div class="code">Código: ${esc(documentCode)}</div>
                  <div class="code">Verificação: ${esc(authenticity.verificationCode)}</div>
                  <div class="hash">Hash SHA-256: ${esc(authenticity.hashLabel)}</div>
                  <div class="hash">Emitido em ${esc(this.formatDisplayDateTime(authenticity.generatedAt))}</div>
                  <div class="badge-valid">Válido</div>
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}
