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

type AuthReq = {
  user?: {
    company_id?: string;
  };
};

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
  @Roles(Role.ADMIN_GERAL)
  @Authorize('can_view_companies')
  findAll() {
    return this.companiesService.findAll();
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
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.companiesService.remove(id);
  }
}
