import {
  Controller,
  GoneException,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { DossiersService } from './dossiers.service';
import { Authorize } from '../auth/authorize.decorator';
import {
  assertUploadedPdf,
  cleanupUploadedTempFile,
  createGovernedPdfUploadOptions,
} from '../common/interceptors/file-upload.interceptor';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
  };
}

@Controller('dossiers')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class DossiersController {
  constructor(private readonly dossiersService: DossiersService) {}

  @Get('employee/:userId/pdf')
  @Header('Deprecation', 'true')
  @Header('Sunset', 'Tue, 30 Jun 2026 00:00:00 GMT')
  @Header(
    'Warning',
    '299 - "Endpoint legado. Use o fluxo governado /dossiers/{employee|site}/:id/pdf/access + /pdf/file."',
  )
  @Authorize('can_view_dossiers')
  generateEmployeeDossier(
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    throw new GoneException(
      `O endpoint legado de PDF do dossiê por colaborador (${userId}) foi descontinuado. Use GET /dossiers/employee/:userId/context, GET /dossiers/employee/:userId/pdf/access e POST /dossiers/employee/:userId/pdf/file.`,
    );
  }

  @Get('employee/:userId/context')
  @Authorize('can_view_dossiers')
  getEmployeeContext(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.dossiersService.getEmployeeDossierContext(userId);
  }

  @Get('employee/:userId/bundle')
  @Authorize('can_view_dossiers')
  async downloadEmployeeBundle(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, buffer } =
      await this.dossiersService.generateEmployeeBundleArchive(userId);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  @Get('site/:siteId/context')
  @Authorize('can_view_dossiers')
  getSiteContext(@Param('siteId', new ParseUUIDPipe()) siteId: string) {
    return this.dossiersService.getSiteDossierContext(siteId);
  }

  @Get('site/:siteId/bundle')
  @Authorize('can_view_dossiers')
  async downloadSiteBundle(
    @Param('siteId', new ParseUUIDPipe()) siteId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, buffer } =
      await this.dossiersService.generateSiteBundleArchive(siteId);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(buffer);
  }

  @Get('employee/:userId/pdf/access')
  @Authorize('can_view_dossiers')
  getEmployeePdfAccess(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.dossiersService.getEmployeePdfAccess(userId, req.user?.id);
  }

  @Post('employee/:userId/pdf/file')
  @UseInterceptors(FileInterceptor('file', createGovernedPdfUploadOptions()))
  @Authorize('can_view_dossiers')
  async attachEmployeePdf(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const pdfFile = await assertUploadedPdf(file);
    try {
      return await this.dossiersService.attachEmployeePdf(
        userId,
        pdfFile,
        req.user?.id,
      );
    } finally {
      await cleanupUploadedTempFile(pdfFile);
    }
  }

  @Get('site/:siteId/pdf/access')
  @Authorize('can_view_dossiers')
  getSitePdfAccess(
    @Param('siteId', new ParseUUIDPipe()) siteId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.dossiersService.getSitePdfAccess(siteId, req.user?.id);
  }

  @Post('site/:siteId/pdf/file')
  @UseInterceptors(FileInterceptor('file', createGovernedPdfUploadOptions()))
  @Authorize('can_view_dossiers')
  async attachSitePdf(
    @Param('siteId', new ParseUUIDPipe()) siteId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const pdfFile = await assertUploadedPdf(file);
    try {
      return await this.dossiersService.attachSitePdf(
        siteId,
        pdfFile,
        req.user?.id,
      );
    } finally {
      await cleanupUploadedTempFile(pdfFile);
    }
  }

  @Get('contract/:contractId/pdf')
  @Header('Deprecation', 'true')
  @Header('Sunset', 'Tue, 30 Jun 2026 00:00:00 GMT')
  @Header(
    'Warning',
    '299 - "Fluxo legado descontinuado. Use os fluxos oficiais por colaborador ou por obra/setor."',
  )
  @Authorize('can_view_dossiers')
  getLegacyContractDossier(
    @Param('contractId', new ParseUUIDPipe()) contractId: string,
  ) {
    throw new GoneException(
      `O fluxo legado de dossiê por contrato (${contractId}) foi descontinuado. Use os fluxos oficiais por colaborador ou por obra/setor.`,
    );
  }
}
