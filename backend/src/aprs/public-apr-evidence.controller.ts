import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { AprsService } from './aprs.service';

@Public()
@Controller('public/evidence')
export class PublicAprEvidenceController {
  constructor(private readonly aprsService: AprsService) {}

  @Get('verify')
  verify(@Query('hash') hash: string) {
    return this.aprsService.verifyEvidenceByHashPublic(hash);
  }
}
