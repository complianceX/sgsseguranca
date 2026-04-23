import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EpisService } from './epis.service';
import { BaseController } from '../common/base/base.controller';
import { Epi } from './entities/epi.entity';
import { CreateEpiDto } from './dto/create-epi.dto';
import { UpdateEpiDto } from './dto/update-epi.dto';
import { CatalogQueryDto } from '../common/dto/catalog-query.dto';
import { Authorize } from '../auth/authorize.decorator';

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

  @Get()
  @Authorize('can_manage_catalogs')
  findAll(@Query() query: CatalogQueryDto) {
    return this.episService.findPaginated(query);
  }
}
