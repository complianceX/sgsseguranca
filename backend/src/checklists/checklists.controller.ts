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
  Query,
} from '@nestjs/common';
import { ChecklistsService } from './checklists.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { Role } from '../auth/enums/roles.enum';

@Controller('checklists')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class ChecklistsController {
  constructor(private readonly checklistsService: ChecklistsService) {}

  @Post('seed/welding-machine')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  seedWeldingMachine() {
    return this.checklistsService.createWeldingMachineTemplate();
  }

  @Post()
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  create(@Body() createChecklistDto: CreateChecklistDto) {
    return this.checklistsService.create(createChecklistDto);
  }

  @Get()
  findAll(
    @Query('onlyTemplates') onlyTemplates?: string,
    @Query('excludeTemplates') excludeTemplates?: string,
  ) {
    return this.checklistsService.findAll({
      onlyTemplates: onlyTemplates === 'true',
      excludeTemplates: excludeTemplates === 'true',
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.checklistsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  update(
    @Param('id') id: string,
    @Body() updateChecklistDto: UpdateChecklistDto,
  ) {
    return this.checklistsService.update(id, updateChecklistDto);
  }

  @Post(':id/send-email')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  sendEmail(@Param('id') id: string, @Body() body: { to: string }) {
    return this.checklistsService.sendEmail(id, body.to);
  }

  @Post('fill-from-template/:templateId')
  @Roles(
    Role.ADMIN_GERAL,
    Role.ADMIN_EMPRESA,
    Role.TST,
    Role.SUPERVISOR,
    Role.TRABALHADOR,
  )
  fillFromTemplate(
    @Param('templateId') templateId: string,
    @Body() fillData: UpdateChecklistDto,
  ) {
    return this.checklistsService.fillFromTemplate(templateId, fillData);
  }

  @Post(':id/save-pdf')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
  savePdf(@Param('id') id: string) {
    return this.checklistsService.savePdfToStorage(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  remove(@Param('id') id: string) {
    return this.checklistsService.remove(id);
  }
}
