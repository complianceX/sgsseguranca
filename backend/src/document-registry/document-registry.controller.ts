import {
  Controller,
  Get,
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

@Controller('document-registry')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class DocumentRegistryController {
  constructor(
    private readonly documentRegistryService: DocumentRegistryService,
  ) {}

  @Get()
  @Authorize('can_view_documents_registry')
  list(
    @Query('company_id') companyId?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
    @Query('modules') modules?: string,
  ) {
    return this.documentRegistryService.list({
      companyId,
      year: year ? Number(year) : undefined,
      week: week ? Number(week) : undefined,
      modules: modules
        ? modules
            .split(',')
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean)
        : undefined,
    });
  }

  @Get('weekly-bundle')
  @Authorize('can_view_documents_registry')
  async getWeeklyBundle(
    @Query('company_id') companyId?: string,
    @Query('year') year?: string,
    @Query('week') week?: string,
    @Query('modules') modules?: string,
  ): Promise<StreamableFile> {
    const { buffer, fileName } =
      await this.documentRegistryService.getWeeklyBundle({
        companyId,
        year: year ? Number(year) : undefined,
        week: week ? Number(week) : undefined,
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
}
