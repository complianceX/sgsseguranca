import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { Authorize } from '../auth/authorize.decorator';
import { Role } from '../auth/enums/roles.enum';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { TenantThrottle } from '../common/decorators/tenant-throttle.decorator';
import { TenantGuard } from '../common/guards/tenant.guard';
import {
  assertUploadedPdf,
  cleanupUploadedTempFile,
  createGovernedPdfUploadOptions,
} from '../common/interceptors/file-upload.interceptor';
import { FileInspectionService } from '../common/security/file-inspection.service';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { CreateDidDto } from './dto/create-did.dto';
import { FindDidsQueryDto } from './dto/find-dids-query.dto';
import { UpdateDidDto } from './dto/update-did.dto';
import { DidsService } from './dids.service';
import { DidStatus } from './entities/did.entity';

const parseTenantThrottle = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveHourlyTenantThrottle = (
  hourlyValue: string | undefined,
  perMinuteValue: number,
) => {
  const parsed = Number(hourlyValue);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return perMinuteValue * 60;
};

const DID_CREATE_TENANT_THROTTLE_LIMIT = parseTenantThrottle(
  process.env.DID_CREATE_TENANT_THROTTLE_LIMIT,
  120,
);
const DID_CREATE_TENANT_THROTTLE_HOUR_LIMIT = resolveHourlyTenantThrottle(
  process.env.DID_CREATE_TENANT_THROTTLE_HOUR_LIMIT,
  DID_CREATE_TENANT_THROTTLE_LIMIT,
);

const DID_STATUS_TENANT_THROTTLE_LIMIT = parseTenantThrottle(
  process.env.DID_STATUS_TENANT_THROTTLE_LIMIT,
  120,
);
const DID_STATUS_TENANT_THROTTLE_HOUR_LIMIT = resolveHourlyTenantThrottle(
  process.env.DID_STATUS_TENANT_THROTTLE_HOUR_LIMIT,
  DID_STATUS_TENANT_THROTTLE_LIMIT,
);

const DID_UPLOAD_TENANT_THROTTLE_LIMIT = parseTenantThrottle(
  process.env.DID_UPLOAD_TENANT_THROTTLE_LIMIT,
  60,
);
const DID_UPLOAD_TENANT_THROTTLE_HOUR_LIMIT = resolveHourlyTenantThrottle(
  process.env.DID_UPLOAD_TENANT_THROTTLE_HOUR_LIMIT,
  DID_UPLOAD_TENANT_THROTTLE_LIMIT,
);

const DID_UPDATE_TENANT_THROTTLE_LIMIT = parseTenantThrottle(
  process.env.DID_UPDATE_TENANT_THROTTLE_LIMIT,
  120,
);
const DID_UPDATE_TENANT_THROTTLE_HOUR_LIMIT = resolveHourlyTenantThrottle(
  process.env.DID_UPDATE_TENANT_THROTTLE_HOUR_LIMIT,
  DID_UPDATE_TENANT_THROTTLE_LIMIT,
);

@Controller('dids')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
@Roles(
  Role.ADMIN_GERAL,
  Role.ADMIN_EMPRESA,
  Role.TST,
  Role.SUPERVISOR,
  Role.COLABORADOR,
  Role.TRABALHADOR,
)
export class DidsController {
  constructor(
    private readonly didsService: DidsService,
    private readonly fileInspectionService: FileInspectionService,
  ) {}

  private getRequestUserId(
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ): string | undefined {
    return req.user?.userId ?? req.user?.id ?? req.user?.sub;
  }

  @Post()
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_dids')
  @TenantThrottle({
    requestsPerMinute: DID_CREATE_TENANT_THROTTLE_LIMIT,
    requestsPerHour: DID_CREATE_TENANT_THROTTLE_HOUR_LIMIT,
  })
  create(@Body() createDidDto: CreateDidDto) {
    return this.didsService.create(createDidDto);
  }

  @Get()
  @Authorize('can_view_dids')
  findAll(@Query() query: FindDidsQueryDto) {
    return this.didsService.findPaginated(query);
  }

  @Get(':id')
  @Authorize('can_view_dids')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.didsService.findOne(id);
  }

  @Get(':id/pdf')
  @Authorize('can_view_dids')
  getPdfAccess(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.didsService.getPdfAccess(id);
  }

  @Post(':id/file')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_dids')
  @TenantThrottle({
    requestsPerMinute: DID_UPLOAD_TENANT_THROTTLE_LIMIT,
    requestsPerHour: DID_UPLOAD_TENANT_THROTTLE_HOUR_LIMIT,
  })
  @UseInterceptors(FileInterceptor('file', createGovernedPdfUploadOptions()))
  async attachFile(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req()
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const pdfFile = await assertUploadedPdf(
      file,
      undefined,
      this.fileInspectionService,
    );
    try {
      return await this.didsService.attachPdf(id, pdfFile, {
        userId: this.getRequestUserId(req),
      });
    } finally {
      await cleanupUploadedTempFile(pdfFile);
    }
  }

  @Patch(':id/status')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_dids')
  @TenantThrottle({
    requestsPerMinute: DID_STATUS_TENANT_THROTTLE_LIMIT,
    requestsPerHour: DID_STATUS_TENANT_THROTTLE_HOUR_LIMIT,
  })
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body('status') status: DidStatus,
  ) {
    if (!Object.values(DidStatus).includes(status)) {
      throw new BadRequestException(`Status inválido: ${status}`);
    }

    return this.didsService.updateStatus(id, status);
  }

  @Patch(':id')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.COLABORADOR,
  )
  @Authorize('can_manage_dids')
  @TenantThrottle({
    requestsPerMinute: DID_UPDATE_TENANT_THROTTLE_LIMIT,
    requestsPerHour: DID_UPDATE_TENANT_THROTTLE_HOUR_LIMIT,
  })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateDidDto: UpdateDidDto,
  ) {
    return this.didsService.update(id, updateDidDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_dids')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.didsService.remove(id);
  }
}
