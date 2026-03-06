import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  Req,
  Get,
  Param,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { PdfService } from '../../common/services/pdf.service';
import { PdfRateLimitService } from '../services/pdf-rate-limit.service';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { validatePdfMagicBytes } from '../../common/interceptors/file-upload.interceptor';

@ApiTags('PDF Security')
@Controller('pdf-security')
@UseGuards(JwtAuthGuard)
export class PdfSecurityController {
  constructor(
    private readonly pdfService: PdfService,
    private readonly pdfRateLimitService: PdfRateLimitService,
  ) {}

  @Post('sign')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 25 * 1024 * 1024,
      },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          return cb(null, false);
        }
        cb(null, true);
      },
    }),
  )
  @ApiOperation({
    summary: 'Sign a PDF file and register it for security tracking',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        originalName: {
          type: 'string',
        },
      },
    },
  })
  async signPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body('originalName') originalName: string,
    @Req() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF files are allowed');
    }
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Falha ao ler o arquivo enviado.');
    }
    await validatePdfMagicBytes(file.buffer);

    const userId = req.user.id;
    const ip = req.ip;

    // Check rate limit (Mass Download Detection)
    try {
      await this.pdfRateLimitService.checkDownloadLimit(userId, ip);
    } catch (error) {
      throw new UnauthorizedException(
        error instanceof Error ? error.message : 'Rate limit exceeded',
      );
    }

    // Sign and save hash
    const hash = await this.pdfService.signAndSave(
      file.buffer,
      originalName || file.originalname,
    );

    return {
      status: 'success',
      hash,
      message: 'PDF signed and registered successfully',
    };
  }

  @Get('verify/:hash')
  @ApiOperation({ summary: 'Verify a PDF file integrity by hash' })
  async verifyPdf(@Param('hash') hash: string) {
    const result = await this.pdfService.verify(hash);
    return result;
  }
}
