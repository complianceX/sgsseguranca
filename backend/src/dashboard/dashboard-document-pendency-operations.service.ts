import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AprsService } from '../aprs/aprs.service';
import { AuditsService } from '../audits/audits.service';
import { CatsService } from '../cats/cats.service';
import { ChecklistsService } from '../checklists/checklists.service';
import { DdsService } from '../dds/dds.service';
import { DocumentImportEnqueueResponseDto } from '../document-import/dto/document-import-queue.dto';
import { DocumentImportService } from '../document-import/services/document-import.service';
import { InspectionsService } from '../inspections/inspections.service';
import { NonConformitiesService } from '../nonconformities/nonconformities.service';
import { PtsService } from '../pts/pts.service';
import { RdosService } from '../rdos/rdos.service';
import {
  DOCUMENT_PENDENCY_MODULE_VIEW_PERMISSIONS,
  DocumentPendencyActionKey,
} from './dashboard-document-pendency.types';

type ResolveDashboardDocumentPendencyActionInput = {
  actionKey:
    | 'open_final_pdf'
    | 'open_governed_video'
    | 'open_governed_attachment';
  module: string;
  documentId: string;
  attachmentId?: string;
  attachmentIndex?: number;
  currentCompanyId?: string;
  actorId?: string;
  permissions?: string[];
};

export type DashboardDocumentPendencyResolvedActionResponse = {
  actionKey: DocumentPendencyActionKey;
  url: string | null;
  availability: string | null;
  message: string | null;
  fileName: string | null;
  fileType: string | null;
};

@Injectable()
export class DashboardDocumentPendencyOperationsService {
  private readonly logger = new Logger(
    DashboardDocumentPendencyOperationsService.name,
  );

  constructor(
    private readonly aprsService: AprsService,
    private readonly auditsService: AuditsService,
    private readonly catsService: CatsService,
    private readonly checklistsService: ChecklistsService,
    private readonly ddsService: DdsService,
    private readonly inspectionsService: InspectionsService,
    private readonly moduleRef: ModuleRef,
    private readonly nonConformitiesService: NonConformitiesService,
    private readonly ptsService: PtsService,
    private readonly rdosService: RdosService,
  ) {}

  async resolveAction(
    input: ResolveDashboardDocumentPendencyActionInput,
  ): Promise<DashboardDocumentPendencyResolvedActionResponse> {
    const permissions = new Set(input.permissions || []);

    switch (input.actionKey) {
      case 'open_final_pdf':
        this.assertModulePermission(
          permissions,
          input.module,
          input.actionKey,
          input.documentId,
        );
        return this.resolveFinalPdf(input);
      case 'open_governed_video':
        this.assertModulePermission(
          permissions,
          input.module,
          input.actionKey,
          input.documentId,
        );
        return this.resolveGovernedVideo(input);
      case 'open_governed_attachment':
        this.assertModulePermission(
          permissions,
          input.module,
          input.actionKey,
          input.documentId,
        );
        return this.resolveGovernedAttachment(input);
      default:
        throw new BadRequestException('Ação operacional não suportada.');
    }
  }

  async retryImport(
    documentId: string,
    input: {
      actorId?: string;
      permissions?: string[];
    },
  ): Promise<DocumentImportEnqueueResponseDto> {
    const permissions = new Set(input.permissions || []);
    const requiredPermission =
      DOCUMENT_PENDENCY_MODULE_VIEW_PERMISSIONS['document-import'];
    if (!permissions.has(requiredPermission)) {
      this.logger.warn({
        event: 'dashboard_document_pendency_import_retry_denied',
        documentId,
        actorId: input.actorId || null,
        requiredPermission,
      });
      throw new ForbiddenException(
        'Você não possui permissão para reenfileirar importações documentais.',
      );
    }

    this.logger.log({
      event: 'dashboard_document_pendency_import_retry_requested',
      documentId,
      actorId: input.actorId || null,
    });

    return this.getDocumentImportService().retryDocumentProcessing(
      documentId,
      input.actorId,
    );
  }

  private getDocumentImportService(): DocumentImportService {
    const documentImportService = this.moduleRef.get(DocumentImportService, {
      strict: false,
    });

    if (!documentImportService) {
      throw new ServiceUnavailableException(
        'Serviço de importação documental indisponível no momento.',
      );
    }

    return documentImportService;
  }

  private async resolveFinalPdf(
    input: ResolveDashboardDocumentPendencyActionInput,
  ): Promise<DashboardDocumentPendencyResolvedActionResponse> {
    switch (input.module) {
      case 'apr': {
        const result = await this.aprsService.getPdfAccess(input.documentId);
        return this.mapResolvedArtifact({
          actionKey: input.actionKey,
          availability: result.availability,
          message: result.message || null,
          url: result.url,
          fileName: result.originalName,
          fileType: 'application/pdf',
        });
      }
      case 'pt': {
        const result = await this.ptsService.getPdfAccess(input.documentId);
        return this.mapResolvedArtifact({
          actionKey: input.actionKey,
          availability: result.availability,
          message: result.message || null,
          url: result.url,
          fileName: result.originalName,
          fileType: 'application/pdf',
        });
      }
      case 'dds': {
        const result = await this.ddsService.getPdfAccess(input.documentId);
        return this.mapResolvedArtifact({
          actionKey: input.actionKey,
          availability: result.availability,
          message: result.message || null,
          url: result.url,
          fileName: result.originalName,
          fileType: 'application/pdf',
        });
      }
      case 'checklist': {
        const result = await this.checklistsService.getPdfAccess(
          input.documentId,
        );
        return this.mapResolvedArtifact({
          actionKey: input.actionKey,
          availability: result.availability,
          message: result.message || null,
          url: result.url,
          fileName: result.originalName,
          fileType: 'application/pdf',
        });
      }
      case 'inspection': {
        const companyId = this.requireCurrentCompanyId(input);
        const result = await this.inspectionsService.getPdfAccess(
          input.documentId,
          companyId,
        );
        return this.mapResolvedArtifact({
          actionKey: input.actionKey,
          availability: result.availability,
          message: result.message || null,
          url: result.url,
          fileName: result.originalName,
          fileType: 'application/pdf',
        });
      }
      case 'rdo': {
        const result = await this.rdosService.getPdfAccess(input.documentId);
        return this.mapResolvedArtifact({
          actionKey: input.actionKey,
          availability: result.availability,
          message: result.message || null,
          url: result.url,
          fileName: result.originalName,
          fileType: 'application/pdf',
        });
      }
      case 'cat': {
        const result = await this.catsService.getPdfAccess(
          input.documentId,
          input.actorId,
        );
        return this.mapResolvedArtifact({
          actionKey: input.actionKey,
          availability: result.availability,
          message: result.message || null,
          url: result.url,
          fileName: result.originalName,
          fileType: 'application/pdf',
        });
      }
      case 'audit': {
        const companyId = this.requireCurrentCompanyId(input);
        const result = await this.auditsService.getPdfAccess(
          input.documentId,
          companyId,
        );
        return this.mapResolvedArtifact({
          actionKey: input.actionKey,
          availability: result.availability,
          message: result.message || null,
          url: result.url,
          fileName: result.originalName,
          fileType: 'application/pdf',
        });
      }
      case 'nonconformity': {
        const result = await this.nonConformitiesService.getPdfAccess(
          input.documentId,
        );
        return this.mapResolvedArtifact({
          actionKey: input.actionKey,
          availability: result.availability,
          message: result.message || null,
          url: result.url,
          fileName: result.originalName,
          fileType: 'application/pdf',
        });
      }
      default:
        throw new BadRequestException(
          'Módulo sem suporte a abertura de PDF final pela central.',
        );
    }
  }

  private async resolveGovernedVideo(
    input: ResolveDashboardDocumentPendencyActionInput,
  ): Promise<DashboardDocumentPendencyResolvedActionResponse> {
    if (!input.attachmentId) {
      throw new BadRequestException(
        'attachmentId é obrigatório para abrir vídeo governado.',
      );
    }

    switch (input.module) {
      case 'dds': {
        const result = await this.ddsService.getVideoAttachmentAccess(
          input.documentId,
          input.attachmentId,
          input.actorId,
        );
        return this.mapResolvedArtifact({
          actionKey: input.actionKey,
          availability: result.availability,
          message: result.message || null,
          url: result.url,
          fileName: result.video.original_name,
          fileType: result.video.mime_type,
        });
      }
      case 'inspection': {
        const companyId = this.requireCurrentCompanyId(input);
        const result = await this.inspectionsService.getVideoAttachmentAccess(
          input.documentId,
          input.attachmentId,
          companyId,
        );
        return this.mapResolvedArtifact({
          actionKey: input.actionKey,
          availability: result.availability,
          message: result.message || null,
          url: result.url,
          fileName: result.video.original_name,
          fileType: result.video.mime_type,
        });
      }
      case 'rdo': {
        const result = await this.rdosService.getVideoAttachmentAccess(
          input.documentId,
          input.attachmentId,
        );
        return this.mapResolvedArtifact({
          actionKey: input.actionKey,
          availability: result.availability,
          message: result.message || null,
          url: result.url,
          fileName: result.video.original_name,
          fileType: result.video.mime_type,
        });
      }
      default:
        throw new BadRequestException(
          'Módulo sem suporte a abertura de vídeo governado pela central.',
        );
    }
  }

  private async resolveGovernedAttachment(
    input: ResolveDashboardDocumentPendencyActionInput,
  ): Promise<DashboardDocumentPendencyResolvedActionResponse> {
    switch (input.module) {
      case 'nonconformity': {
        if (!Number.isInteger(input.attachmentIndex)) {
          throw new BadRequestException(
            'attachmentIndex é obrigatório para abrir anexo governado de não conformidade.',
          );
        }

        const result = await this.nonConformitiesService.getAttachmentAccess(
          input.documentId,
          input.attachmentIndex as number,
        );
        return this.mapResolvedArtifact({
          actionKey: input.actionKey,
          availability: result.availability,
          message: result.message || null,
          url: result.url,
          fileName: result.originalName,
          fileType: result.mimeType,
        });
      }
      case 'cat': {
        if (!input.attachmentId) {
          throw new BadRequestException(
            'attachmentId é obrigatório para abrir anexo governado de CAT.',
          );
        }

        const result = await this.catsService.getAttachmentAccess(
          input.documentId,
          input.attachmentId,
          input.actorId,
        );
        return this.mapResolvedArtifact({
          actionKey: input.actionKey,
          availability: 'ready',
          message: null,
          url: result.url,
          fileName: result.fileName,
          fileType: result.fileType,
        });
      }
      default:
        throw new BadRequestException(
          'Módulo sem suporte a abertura de anexo governado pela central.',
        );
    }
  }

  private assertModulePermission(
    permissions: Set<string>,
    module: string,
    actionKey: DocumentPendencyActionKey,
    documentId: string,
  ): void {
    const requiredPermission =
      DOCUMENT_PENDENCY_MODULE_VIEW_PERMISSIONS[module] || null;
    if (!requiredPermission || !permissions.has(requiredPermission)) {
      this.logger.warn({
        event: 'dashboard_document_pendency_action_denied',
        actionKey,
        module,
        documentId,
        requiredPermission,
      });
      throw new ForbiddenException(
        'Você não possui permissão para executar esta ação operacional.',
      );
    }
  }

  private requireCurrentCompanyId(
    input: Pick<
      ResolveDashboardDocumentPendencyActionInput,
      'currentCompanyId'
    >,
  ): string {
    if (!input.currentCompanyId) {
      throw new BadRequestException(
        'Contexto de empresa não identificado para esta ação operacional.',
      );
    }

    return input.currentCompanyId;
  }

  private mapResolvedArtifact(input: {
    actionKey: DocumentPendencyActionKey;
    availability: string | null | undefined;
    message: string | null | undefined;
    url: string | null | undefined;
    fileName: string | null | undefined;
    fileType: string | null | undefined;
  }): DashboardDocumentPendencyResolvedActionResponse {
    this.logger.log({
      event: 'dashboard_document_pendency_action_resolved',
      actionKey: input.actionKey,
      availability: input.availability || null,
      hasUrl: Boolean(input.url),
    });

    return {
      actionKey: input.actionKey,
      url: input.url || null,
      availability: input.availability || null,
      message: input.message || null,
      fileName: input.fileName || null,
      fileType: input.fileType || null,
    };
  }
}
