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
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { AprsService } from './aprs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { CreateAprDto } from './dto/create-apr.dto';
import { UpdateAprDto } from './dto/update-apr.dto';
import { PdfRateLimitService } from '../auth/services/pdf-rate-limit.service';

@Controller('aprs')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class AprsController {
  constructor(
    private readonly aprsService: AprsService,
    private readonly pdfRateLimitService: PdfRateLimitService,
  ) {}

  @Post()
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.COLABORADOR)
  create(@Body() createAprDto: CreateAprDto) {
    return this.aprsService.create(createAprDto);
  }

  @Get()
  findPaginated(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.aprsService.findPaginated({
      page: Number(page),
      limit: Number(limit),
    });
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
    return this.aprsService.findOne(id);
  }

  @Patch(':id')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  update(@Param('id') id: string, @Body() updateAprDto: UpdateAprDto) {
    return this.aprsService.update(id, updateAprDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  remove(@Param('id') id: string) {
    return this.aprsService.remove(id);
  }
}
