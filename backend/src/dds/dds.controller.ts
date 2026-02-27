import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { DdsService } from './dds.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { CreateDdsDto } from './dto/create-dds.dto';
import { UpdateDdsDto } from './dto/update-dds.dto';
import { PdfRateLimitService } from '../auth/services/pdf-rate-limit.service';
import { Role } from '../auth/enums/roles.enum';

@Controller('dds')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class DdsController {
  constructor(
    private readonly ddsService: DdsService,
    private readonly pdfRateLimitService: PdfRateLimitService,
  ) {}

  @Post()
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  create(@Body() createDdsDto: CreateDdsDto) {
    return this.ddsService.create(createDdsDto);
  }

  @Get()
  findAll() {
    return this.ddsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: any) {
    // Check rate limit for mass data access/PDF generation
    try {
      if (req.user && req.user.id) {
        await this.pdfRateLimitService.checkDownloadLimit(req.user.id, req.ip);
      }
    } catch (error) {
      throw new UnauthorizedException(error.message);
    }
    return this.ddsService.findOne(id);
  }

  @Patch(':id')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  update(@Param('id') id: string, @Body() updateDdsDto: UpdateDdsDto) {
    return this.ddsService.update(id, updateDdsDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  remove(@Param('id') id: string) {
    return this.ddsService.remove(id);
  }
}
