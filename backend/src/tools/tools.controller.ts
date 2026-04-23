import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ToolsService } from './tools.service';
import { BaseController } from '../common/base/base.controller';
import { Tool } from './entities/tool.entity';
import { CreateToolDto } from './dto/create-tool.dto';
import { UpdateToolDto } from './dto/update-tool.dto';
import { Authorize } from '../auth/authorize.decorator';
import { CatalogQueryDto } from '../common/dto/catalog-query.dto';

@ApiTags('tools')
@Controller('tools')
export class ToolsController extends BaseController<
  Tool,
  CreateToolDto,
  UpdateToolDto
> {
  constructor(private readonly toolsService: ToolsService) {
    super(toolsService, 'Ferramenta');
  }

  @Get()
  @Authorize('can_manage_catalogs')
  findPaginated(@Query() query: CatalogQueryDto) {
    return this.toolsService.findPaginated(query);
  }
}
