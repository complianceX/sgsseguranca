import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuditsService } from './audits.service';
import { CreateAuditDto, UpdateAuditDto } from './dto/create-audit.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

type RequestWithUser = { user: { companyId: string } };

@Controller('audits')
@UseGuards(JwtAuthGuard)
export class AuditsController {
  constructor(private readonly auditsService: AuditsService) {}

  @Post()
  create(
    @Body() createAuditDto: CreateAuditDto,
    @Request() req: RequestWithUser,
  ) {
    return this.auditsService.create(createAuditDto, req.user.companyId);
  }

  @Get()
  findAll(@Request() req: RequestWithUser) {
    return this.auditsService.findAll(req.user.companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.auditsService.findOne(id, req.user.companyId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateAuditDto: UpdateAuditDto,
    @Request() req: RequestWithUser,
  ) {
    return this.auditsService.update(id, updateAuditDto, req.user.companyId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.auditsService.remove(id, req.user.companyId);
  }
}
