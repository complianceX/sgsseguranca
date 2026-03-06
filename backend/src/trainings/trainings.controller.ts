import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseUUIDPipe,
  Delete,
  UseGuards,
  UseInterceptors,
  Query,
  Header,
  StreamableFile,
} from '@nestjs/common';
import { TrainingsService } from './trainings.service';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Role } from '../auth/enums/roles.enum';

@Controller('trainings')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class TrainingsController {
  constructor(private readonly trainingsService: TrainingsService) {}

  @Post()
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  create(@Body() createTrainingDto: CreateTrainingDto) {
    return this.trainingsService.create(createTrainingDto);
  }

  @Get()
  findPaginated(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.trainingsService.findPaginated({
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get('user/:userId')
  findByUserId(@Param('userId') userId: string) {
    return this.trainingsService.findByUserId(userId);
  }

  @Get('expiry/summary')
  getExpirySummary() {
    return this.trainingsService.findExpirySummary();
  }

  @Get('expiry/expiring')
  getExpiring(@Query('days') days?: string) {
    return this.trainingsService.findExpiring(days ? Number(days) : 7);
  }

  @Post('expiry/notify')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  notifyExpiry(@Query('days') days?: string) {
    return this.trainingsService.dispatchExpiryNotifications(
      days ? Number(days) : 7,
    );
  }

  @Get('compliance/blocking-users')
  getBlockingUsers() {
    return this.trainingsService.findBlockingUsers();
  }

  @Get('compliance/user/:userId')
  getComplianceByUser(@Param('userId') userId: string) {
    return this.trainingsService.getComplianceByUser(userId);
  }

  @Get('export/excel')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="treinamentos.xlsx"')
  async exportExcel(): Promise<StreamableFile> {
    const buffer = await this.trainingsService.exportExcel();
    return new StreamableFile(buffer);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.trainingsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateTrainingDto: UpdateTrainingDto,
  ) {
    return this.trainingsService.update(id, updateTrainingDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL)
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.trainingsService.remove(id);
  }
}
