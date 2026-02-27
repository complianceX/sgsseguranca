import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { InspectionsService } from './inspections.service';
import {
  CreateInspectionDto,
  UpdateInspectionDto,
} from './dto/create-inspection.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

type RequestWithUser = { user: { companyId: string } };

@Controller('inspections')
@UseGuards(JwtAuthGuard)
export class InspectionsController {
  constructor(private readonly inspectionsService: InspectionsService) {}

  @Post()
  create(
    @Body() createInspectionDto: CreateInspectionDto,
    @Request() req: RequestWithUser,
  ) {
    return this.inspectionsService.create(
      createInspectionDto,
      req.user.companyId,
    );
  }

  @Get()
  findAll(@Request() req: RequestWithUser) {
    return this.inspectionsService.findAll(req.user.companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.inspectionsService.findOne(id, req.user.companyId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateInspectionDto: UpdateInspectionDto,
    @Request() req: RequestWithUser,
  ) {
    return this.inspectionsService.update(
      id,
      updateInspectionDto,
      req.user.companyId,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.inspectionsService.remove(id, req.user.companyId);
  }
}
