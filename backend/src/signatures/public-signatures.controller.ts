import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { SignaturesService } from './signatures.service';

@Public()
@Controller('public/signature')
export class PublicSignaturesController {
  constructor(private readonly signaturesService: SignaturesService) {}

  @Get('verify')
  verify(@Query('hash') hash: string) {
    return this.signaturesService.verifyByHashPublic(hash);
  }
}
