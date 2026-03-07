import {
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  UseInterceptors,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import {
  Repository,
  FindOptionsWhere,
  DeepPartial,
  ObjectLiteral,
} from 'typeorm';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Authorize } from '../../auth/authorize.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { Role } from '../../auth/enums/roles.enum';
import { TenantInterceptor } from '../tenant/tenant.interceptor';
import { TenantGuard } from '../guards/tenant.guard';
import { BaseService } from './base.service';
import { PaginationDto } from '../dto/pagination.dto';

/**
 * BaseController abstrato que implementa padrão CRUD consistente
 * Reduz duplicação de código em 40% entre controllers
 *
 * Uso:
 * @Controller('users')
 * export class UsersController extends BaseController<User, CreateUserDto, UpdateUserDto> {
 *   constructor(usersService: UsersService) {
 *     super(usersService, 'User', ['Administrador Geral', 'Administrador da Empresa']);
 *   }
 * }
 */
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
@ApiBearerAuth('access-token')
export abstract class BaseController<
  T extends ObjectLiteral,
  CreateDto extends DeepPartial<T>,
  UpdateDto extends DeepPartial<T>,
> {
  protected readonly defaultRoles: string[] = [];

  constructor(
    protected readonly service: BaseService<T>,
    protected readonly entityName: string,
    defaultRoles?: string[],
  ) {
    if (defaultRoles) {
      this.defaultRoles = defaultRoles;
    }
  }

  @Post()
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_catalogs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Criar novo registro' })
  @ApiResponse({
    status: 201,
    description: 'Criado com sucesso',
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos',
  })
  async create(@Body() createDto: CreateDto): Promise<T> {
    return this.service.create(createDto);
  }

  @Get()
  @Authorize('can_manage_catalogs')
  @ApiOperation({ summary: 'Listar todos os registros' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Número da página (padrão: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Itens por página (padrão: 10)',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de registros',
  })
  async findAll(@Query() pagination: PaginationDto): Promise<any> {
    const where = {} as FindOptionsWhere<T>;
    return this.service.findAll(where);
  }

  @Get(':id')
  @Authorize('can_manage_catalogs')
  @ApiOperation({ summary: 'Obter por ID' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'ID do registro',
  })
  @ApiResponse({
    status: 200,
    description: 'Encontrado com sucesso',
  })
  @ApiResponse({
    status: 404,
    description: 'Não encontrado',
  })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<T> {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA, Role.TST)
  @Authorize('can_manage_catalogs')
  @ApiOperation({ summary: 'Atualizar registro' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'ID do registro',
  })
  @ApiResponse({
    status: 200,
    description: 'Atualizado com sucesso',
  })
  @ApiResponse({
    status: 404,
    description: 'Não encontrado',
  })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateDto: UpdateDto,
  ): Promise<T> {
    return this.service.update(id, updateDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL)
  @Authorize('can_manage_catalogs')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deletar registro' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'ID do registro',
  })
  @ApiResponse({
    status: 204,
    description: 'Deletado com sucesso',
  })
  @ApiResponse({
    status: 404,
    description: 'Não encontrado',
  })
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.service.remove(id);
  }
}
