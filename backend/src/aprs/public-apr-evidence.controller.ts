import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { AprsService } from './aprs.service';
import { Throttle } from '@nestjs/throttler';

const SHA256_RE = /^[a-f0-9]{64}$/i;

@Public()
@Controller('public/evidence')
export class PublicAprEvidenceController {
  constructor(private readonly aprsService: AprsService) {}

  @Get('verify')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  verify(@Query('hash') hash: string) {
    if (!SHA256_RE.test(String(hash ?? '').trim())) {
      throw new BadRequestException('hash deve ser um SHA-256 hexadecimal válido (64 caracteres).');
    }
    return this.aprsService.verifyEvidenceByHashPublic(hash);
  }
}
