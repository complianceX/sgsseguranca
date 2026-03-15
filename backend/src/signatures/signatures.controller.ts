import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Query,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { SignaturesService } from './signatures.service';
import { CreateSignatureDto } from './dto/create-signature.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { Authorize } from '../auth/authorize.decorator';

@Controller('signatures')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class SignaturesController {
  constructor(private readonly signaturesService: SignaturesService) {}

  @Post()
  @Authorize('can_manage_signatures')
  create(
    @Body() createSignatureDto: CreateSignatureDto,
    @Request() req: RequestWithUser,
  ) {
    return this.signaturesService.create(createSignatureDto, req.user.userId);
  }

  @Get()
  @Authorize('can_view_signatures')
  findByDocument(
    @Query('document_id') document_id: string,
    @Query('document_type') document_type: string,
  ) {
    return this.signaturesService.findByDocument(document_id, document_type);
  }

  @Get('verify/:id')
  @Authorize('can_view_signatures')
  verifyById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.signaturesService.verifyById(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_signatures')
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: RequestWithUser,
  ) {
    return this.signaturesService.remove(
      id,
      req.user.userId,
      req.user.profile?.nome,
    );
  }

  @Delete('document/:document_id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  @Authorize('can_manage_signatures')
  removeByDocument(
    @Param('document_id') document_id: string,
    @Query('document_type') document_type: string,
    @Request() req: RequestWithUser,
  ) {
    return this.signaturesService.removeByDocument(
      document_id,
      document_type,
      req.user.userId,
      req.user.profile?.nome,
    );
  }
}
