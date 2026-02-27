import {
  Controller,
  Get,
  Param,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { DossiersService } from './dossiers.service';

@Controller('dossiers')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
export class DossiersController {
  constructor(private readonly dossiersService: DossiersService) {}

  @Get('employee/:userId/pdf')
  async generateEmployeeDossier(
    @Param('userId') userId: string,
    @Res() res: Response,
  ) {
    const { filename, buffer } =
      await this.dossiersService.generateEmployeeDossier(userId);
    this.sendPdf(res, filename, buffer);
  }

  private sendPdf(res: Response, filename: string, buffer: Buffer) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }
}
