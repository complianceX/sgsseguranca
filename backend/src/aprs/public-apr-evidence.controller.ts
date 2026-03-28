import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { AprsService } from './aprs.service';
import { Throttle } from '@nestjs/throttler';

@Public()
@Controller('public/evidence')
export class PublicAprEvidenceController {
  constructor(private readonly aprsService: AprsService) {}

  @Get('verify')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  verify(@Query('hash') hash: string) {
    return this.aprsService.verifyEvidenceByHashPublic(hash);
  }
}
