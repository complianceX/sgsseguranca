import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { TenantOptional } from '../common/decorators/tenant-optional.decorator';
import { SubmitPublicDdsSignatureDto } from './dto/dds-signature-invite.dto';
import { DdsSignatureInviteService } from './dds-signature-invite.service';

const PUBLIC_DDS_SIGNATURE_THROTTLE_LIMIT = Number(
  process.env.PUBLIC_DDS_SIGNATURE_THROTTLE_LIMIT || 12,
);
const PUBLIC_DDS_SIGNATURE_THROTTLE_TTL = Number(
  process.env.PUBLIC_DDS_SIGNATURE_THROTTLE_TTL || 60_000,
);

@Public()
@TenantOptional()
@Controller('public/dds/signature')
export class PublicDdsSignatureController {
  constructor(
    private readonly signatureInviteService: DdsSignatureInviteService,
  ) {}

  @Get(':token')
  @Throttle({
    default: {
      limit: PUBLIC_DDS_SIGNATURE_THROTTLE_LIMIT,
      ttl: PUBLIC_DDS_SIGNATURE_THROTTLE_TTL,
    },
  })
  getContext(@Param('token') token: string) {
    return this.signatureInviteService.getPublicContext(token);
  }

  @Post(':token')
  @Throttle({
    default: {
      limit: PUBLIC_DDS_SIGNATURE_THROTTLE_LIMIT,
      ttl: PUBLIC_DDS_SIGNATURE_THROTTLE_TTL,
    },
  })
  submitSignature(
    @Param('token') token: string,
    @Body() dto: SubmitPublicDdsSignatureDto,
    @Req() req: Request,
  ) {
    return this.signatureInviteService.submitPublicSignature(token, {
      acceptedTerms: dto.accepted_terms,
      signatureData: dto.signature_data,
      ip: req.ip || req.socket.remoteAddress || null,
      userAgent: this.getRequestUserAgent(req),
    });
  }

  private getRequestUserAgent(req: Request): string | null {
    const userAgent = req.headers['user-agent'];
    if (Array.isArray(userAgent)) {
      return userAgent[0] || null;
    }
    return typeof userAgent === 'string' && userAgent.trim()
      ? userAgent
      : null;
  }
}
