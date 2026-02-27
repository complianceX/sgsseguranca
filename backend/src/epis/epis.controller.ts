import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EpisService } from './epis.service';
import { BaseController } from '../common/base/base.controller';
import { Epi } from './entities/epi.entity';
import { CreateEpiDto } from './dto/create-epi.dto';
import { UpdateEpiDto } from './dto/update-epi.dto';

@ApiTags('epis')
@Controller('epis')
export class EpisController extends BaseController<
  Epi,
  CreateEpiDto,
  UpdateEpiDto
> {
  constructor(private readonly episService: EpisService) {
    super(episService, 'EPI');
  }
}
