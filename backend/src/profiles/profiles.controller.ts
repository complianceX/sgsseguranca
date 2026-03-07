import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ProfilesService } from './profiles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { TenantOptional } from '../common/decorators/tenant-optional.decorator';
import { Authorize } from '../auth/authorize.decorator';

@Controller('profiles')
@TenantOptional()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Post()
  @Roles(Role.ADMIN_GERAL)
  @Authorize('can_manage_profiles')
  create(@Body() createProfileDto: CreateProfileDto) {
    return this.profilesService.create(createProfileDto);
  }

  @Get()
  @Roles(Role.ADMIN_GERAL)
  @Authorize('can_view_profiles')
  findAll() {
    return this.profilesService.findAll();
  }

  @Get(':id')
  @Roles(Role.ADMIN_GERAL)
  @Authorize('can_view_profiles')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.profilesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_GERAL)
  @Authorize('can_manage_profiles')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.profilesService.update(id, updateProfileDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL)
  @Authorize('can_manage_profiles')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.profilesService.remove(id);
  }
}
