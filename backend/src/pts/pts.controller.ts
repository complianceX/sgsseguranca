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
import { PtsService } from './pts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { CreatePtDto } from './dto/create-pt.dto';
import { UpdatePtDto } from './dto/update-pt.dto';
import { PdfRateLimitService } from '../auth/services/pdf-rate-limit.service';

@Controller('pts')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class PtsController {
  constructor(
    private readonly ptsService: PtsService,
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
  create(@Body() createPtDto: CreatePtDto) {
    return this.ptsService.create(createPtDto);
  }

  @Get()
  findAll() {
    return this.ptsService.findAll();
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
    return this.ptsService.findOne(id);
  }

  @Patch(':id')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  update(@Param('id') id: string, @Body() updatePtDto: UpdatePtDto) {
    return this.ptsService.update(id, updatePtDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  remove(@Param('id') id: string) {
    return this.ptsService.remove(id);
  }
}
