import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
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
import { TenantGuard } from '../common/guards/tenant.guard';
import {
  cleanupUploadedTempFile,
  createTemporaryUploadOptions,
  inspectUploadedFileBuffer,
  readUploadedFileBuffer,
  validateFileMagicBytes,
} from '../common/interceptors/file-upload.interceptor';
import { FileInspectionService } from '../common/security/file-inspection.service';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { CreateExpenseAdvanceDto } from './dto/create-expense-advance.dto';
import { CreateExpenseItemDto } from './dto/create-expense-item.dto';
import { CreateExpenseReportDto } from './dto/create-expense-report.dto';
import { FindExpenseReportsQueryDto } from './dto/find-expense-reports-query.dto';
import { UpdateExpenseReportDto } from './dto/update-expense-report.dto';
import { ExpensesService } from './expenses.service';

const RECEIPT_UPLOAD_OPTIONS = createTemporaryUploadOptions({
  maxFileSize: 15 * 1024 * 1024,
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/octet-stream',
    ];
    cb(null, allowed.includes(String(file.mimetype || '').toLowerCase()));
  },
});

@Controller('expenses')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
@Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST, Role.SUPERVISOR)
export class ExpensesController {
  constructor(
    private readonly expensesService: ExpensesService,
    private readonly fileInspectionService: FileInspectionService,
  ) {}

  private getRequestUserId(
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ): string | undefined {
    return req.user?.userId ?? req.user?.id ?? req.user?.sub;
  }

  @Get('reports')
  @Authorize('can_view_expenses')
  findReports(@Query() query: FindExpenseReportsQueryDto) {
    return this.expensesService.findPaginated(query);
  }

  @Post('reports')
  @Authorize('can_manage_expenses')
  createReport(@Body() body: CreateExpenseReportDto) {
    return this.expensesService.create(body);
  }

  @Get('reports/:id')
  @Authorize('can_view_expenses')
  findReport(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.expensesService.findOne(id);
  }

  @Patch('reports/:id')
  @Authorize('can_manage_expenses')
  updateReport(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateExpenseReportDto,
  ) {
    return this.expensesService.update(id, body);
  }

  @Post('reports/:id/advances')
  @Authorize('can_manage_expenses')
  addAdvance(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CreateExpenseAdvanceDto,
    @Req()
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ) {
    return this.expensesService.addAdvance(
      id,
      body,
      this.getRequestUserId(req),
    );
  }

  @Post('reports/:id/items')
  @Authorize('can_manage_expenses')
  @UseInterceptors(FileInterceptor('file', RECEIPT_UPLOAD_OPTIONS))
  async addItem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CreateExpenseItemDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req()
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ) {
    const receipt = await this.assertReceipt(file);
    try {
      return await this.expensesService.addItem(
        id,
        body,
        receipt,
        this.getRequestUserId(req),
      );
    } finally {
      await cleanupUploadedTempFile(receipt);
    }
  }

  @Delete('reports/:id/items/:itemId')
  @Authorize('can_manage_expenses')
  removeItem(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
  ) {
    return this.expensesService.removeItem(id, itemId);
  }

  @Post('reports/:id/close')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA)
  @Authorize('can_close_expenses')
  closeReport(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req()
    req: Request & {
      user?: { id?: string; userId?: string; sub?: string };
    },
  ) {
    return this.expensesService.close(id, this.getRequestUserId(req));
  }

  @Get('reports/:id/items/:itemId/receipt')
  @Authorize('can_view_expenses')
  getReceipt(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
  ) {
    return this.expensesService.getReceiptAccess(id, itemId);
  }

  @Get('reports/:id/export')
  @Authorize('can_view_expenses')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header('Content-Disposition', 'attachment; filename="despesas-obra.xlsx"')
  async exportReport(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<StreamableFile> {
    return new StreamableFile(await this.expensesService.exportReport(id));
  }

  private async assertReceipt(
    file: Express.Multer.File | undefined,
  ): Promise<Express.Multer.File> {
    const buffer = await readUploadedFileBuffer(
      file,
      'Comprovante obrigatório para lançar despesa.',
    );
    validateFileMagicBytes(buffer, [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]);
    await inspectUploadedFileBuffer(buffer, file!, this.fileInspectionService);
    return file!;
  }
}
