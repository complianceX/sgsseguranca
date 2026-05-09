import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { Authorize } from '../auth/authorize.decorator';
import { DocumentRegistryService } from './document-registry.service';
import { DocumentRegistryEntry } from './entities/document-registry.entity';
import {
  SensitiveAction,
  SensitiveActionGuard,
} from '../common/security/sensitive-action.guard';

const parseOptionalNumberParam = (
  value: string | undefined,
  label: string,
): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new BadRequestException(`${label} deve ser um numero inteiro.`);
  }

  return parsed;
};

const parseOptionalYear = (value?: string) => {
  const year = parseOptionalNumberParam(value, 'Ano');
  if (year !== undefined && (year < 2000 || year > 2100)) {
    throw new BadRequestException('Ano fora do intervalo permitido.');
  }
  return year;
};

const parseOptionalIsoWeek = (value?: string) => {
  const week = parseOptionalNumberParam(value, 'Semana');
  if (week !== undefined && (week < 1 || week > 53)) {
    throw new BadRequestException('Semana ISO fora do intervalo permitido.');
  }
  return week;
};

@Controller('document-registry')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class DocumentRegistryController {
  constructor(
    private readonly documentRegistryService: DocumentRegistryService,
  ) {}

  @Get()
  @Authorize('can_view_documents_registry')
  async list(
    @Query('year') year?: string,
    @Query('week') week?: string,
    @Query('modules') modules?: string,
  ) {
    const entries = await this.documentRegistryService.list({
      year: parseOptionalYear(year),
      week: parseOptionalIsoWeek(week),
      modules: modules
        ? modules
            .split(',')
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean)
        : undefined,
    });
    return entries.map((entry) => this.toPublicRegistryEntry(entry));
  }

  @Get(':id/pdf')
  @Authorize('can_view_documents_registry')
  getPdfAccess(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.documentRegistryService.getPdfAccess(id);
  }

  @Get('weekly-bundle')
  @Authorize('can_view_documents_registry')
  @UseGuards(SensitiveActionGuard)
  @SensitiveAction('weekly_bundle_download')
  async getWeeklyBundle(
    @Query('year') year?: string,
    @Query('week') week?: string,
    @Query('modules') modules?: string,
  ): Promise<StreamableFile> {
    const { buffer, fileName } =
      await this.documentRegistryService.getWeeklyBundle({
        year: parseOptionalYear(year),
        week: parseOptionalIsoWeek(week),
        modules: modules
          ? modules
              .split(',')
              .map((item) => item.trim().toLowerCase())
              .filter(Boolean)
          : undefined,
      });

    return new StreamableFile(buffer, {
      disposition: `attachment; filename="${fileName}"`,
      type: 'application/pdf',
    });
  }

  private toPublicRegistryEntry(entry: DocumentRegistryEntry) {
    return {
      id: entry.id,
      module: entry.module,
      document_type: entry.document_type,
      entity_id: entry.entity_id,
      title: entry.title,
      document_date: entry.document_date,
      iso_year: entry.iso_year,
      iso_week: entry.iso_week,
      original_name: entry.original_name,
      mime_type: entry.mime_type,
      document_code: entry.document_code,
      created_at: entry.created_at,
      updated_at: entry.updated_at,
    };
  }
}
