import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  NotFoundException,
  Req,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { TenantService } from '../common/tenant/tenant.service';
import { TenantOptional } from '../common/decorators/tenant-optional.decorator';
import { Authorize } from '../auth/authorize.decorator';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiStandardResponses } from '../common/swagger/api-standard-responses.decorator';
import { AuditAction as ForensicAuditAction } from '../common/decorators/audit-action.decorator';
import { CompanyResponseDto } from './dto/company-response.dto';
import {
  normalizeOffsetPagination,
  OffsetPage,
} from '../common/utils/offset-pagination.util';

type AuthReq = {
  user?: {
    company_id?: string;
  };
};

@ApiTags('companies')
@ApiBearerAuth('access-token')
@ApiStandardResponses({ includeNotFound: true })
@Controller('companies')
@TenantOptional()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly tenantService: TenantService,
  ) {}

  @Post()
  @Roles(Role.ADMIN_GERAL)
  @Authorize('can_manage_companies')
  create(@Body() createCompanyDto: CreateCompanyDto) {
    return this.companiesService.create(createCompanyDto);
  }

  @Get()
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_view_companies')
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Número da página',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Limite de itens por página (máx. 100)',
  })
  findAll(
    @Req() req: AuthReq,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ): Promise<OffsetPage<CompanyResponseDto>> {
    const isSuperAdmin = this.tenantService.isSuperAdmin();
    if (!isSuperAdmin) {
      const tenantId = req.user?.company_id || this.tenantService.getTenantId();
      const normalizedSearch = search?.trim().toLowerCase();
      const pagination = normalizeOffsetPagination(
        {
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
        },
        { defaultLimit: 20, maxLimit: 100 },
      );

      if (!tenantId) {
        return Promise.resolve({
          data: [],
          total: 0,
          page: pagination.page,
          limit: pagination.limit,
          lastPage: 1,
        });
      }

      return this.companiesService.findOne(tenantId).then((company) => {
        const matchesSearch =
          !normalizedSearch ||
          [company.razao_social, company.cnpj, company.responsavel]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(normalizedSearch));
        const data = matchesSearch ? [company] : [];

        return {
          data,
          total: data.length,
          page: pagination.page,
          limit: pagination.limit,
          lastPage: 1,
        };
      });
    }

    return this.companiesService.findPaginated({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search,
    });
  }

  @Get(':id')
  @Authorize('can_view_companies')
  findOne(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: AuthReq) {
    // Broken Object Level Authorization (BOLA) fix:
    // - companies é uma tabela global (sem company_id e sem RLS)
    // - usuários comuns só podem acessar a própria empresa
    const tenantId = req.user?.company_id || this.tenantService.getTenantId();
    const isSuperAdmin = this.tenantService.isSuperAdmin();

    // Anti-oracle: retornar 404 evita diferenciar "não existe" vs "não pertence ao tenant".
    if (!isSuperAdmin && (!tenantId || id !== tenantId)) {
      throw new NotFoundException('Empresa não encontrada.');
    }
    return this.companiesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_GERAL)
  @Authorize('can_manage_companies')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(id, updateCompanyDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL)
  @Authorize('can_manage_companies')
  @ForensicAuditAction('delete', 'company')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.companiesService.remove(id);
  }
}
