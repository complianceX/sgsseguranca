import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseUUIDPipe,
  Delete,
  UseGuards,
  UseInterceptors,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { WorkerOperationalStatusService } from './worker-operational-status.service';
import { WorkerTimelineService } from './worker-timeline.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/roles.enum';
import { TenantInterceptor } from '../common/tenant/tenant.interceptor';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { Authorize } from '../auth/authorize.decorator';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@UseInterceptors(TenantInterceptor)
@ApiBearerAuth('access-token')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly workerOperationalStatusService: WorkerOperationalStatusService,
    private readonly workerTimelineService: WorkerTimelineService,
  ) {}

  @Post()
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA)
  @Authorize('can_manage_users')
  @ApiOperation({ summary: 'Criar novo usuário' })
  @ApiResponse({
    status: 201,
    description: 'Usuário criado com sucesso',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos',
    schema: {
      example: {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos',
          details: ['CPF já cadastrado'],
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  create(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @Authorize('can_view_users')
  @ApiOperation({ summary: 'Listar todos os usuários' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Número da página',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Limite de itens por página',
  })
  @ApiQuery({
    name: 'company_id',
    required: false,
    type: String,
    description: 'Filtro por empresa (uso administrativo)',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de usuários retornada com sucesso',
    schema: {
      example: {
        data: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            nome: 'João da Silva',
            cpf: '12345678900',
            email: 'joao@example.com',
            status: true,
          },
        ],
        total: 1,
        page: 1,
        lastPage: 1,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  findPaginated(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('search') search?: string,
    @Query('company_id') companyId?: string,
  ) {
    return this.usersService.findPaginated({
      page: Number(page),
      limit: Number(limit),
      search: search || undefined,
      companyId: companyId || undefined,
    });
  }

  @Get('worker-status/cpf/:cpf')
  @Authorize('can_view_users')
  @ApiOperation({ summary: 'Consultar status operacional do trabalhador por CPF' })
  @ApiResponse({ status: 200, description: 'Status operacional retornado com sucesso' })
  @ApiResponse({ status: 404, description: 'Trabalhador não encontrado' })
  getWorkerStatusByCpf(@Param('cpf') cpf: string) {
    return this.workerOperationalStatusService.getByCpf(cpf);
  }

  @Get('worker-status/cpf/:cpf/timeline')
  @Authorize('can_view_users')
  @ApiOperation({ summary: 'Consultar timeline operacional do trabalhador por CPF' })
  @ApiResponse({ status: 200, description: 'Timeline operacional retornada com sucesso' })
  @ApiResponse({ status: 404, description: 'Trabalhador não encontrado' })
  getWorkerTimelineByCpf(@Param('cpf') cpf: string) {
    return this.workerTimelineService.getByCpf(cpf);
  }

  @Get(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA)
  @Authorize('can_view_users')
  @ApiOperation({ summary: 'Buscar usuário por ID' })
  @ApiParam({ name: 'id', description: 'ID do usuário', type: String })
  @ApiResponse({
    status: 200,
    description: 'Usuário encontrado com sucesso',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string): Promise<UserResponseDto> {
    return this.usersService.findOne(id);
  }

  @Get(':id/timeline')
  @Authorize('can_view_users')
  @ApiOperation({ summary: 'Consultar timeline operacional do trabalhador por ID' })
  @ApiParam({ name: 'id', description: 'ID do usuário', type: String })
  @ApiResponse({ status: 200, description: 'Timeline operacional retornada com sucesso' })
  @ApiResponse({ status: 404, description: 'Trabalhador não encontrado' })
  getWorkerTimeline(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.workerTimelineService.getByUserId(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA)
  @Authorize('can_manage_users')
  @ApiOperation({ summary: 'Atualizar usuário' })
  @ApiParam({ name: 'id', description: 'ID do usuário', type: String })
  @ApiResponse({
    status: 200,
    description: 'Usuário atualizado com sucesso',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Dados inválidos',
    schema: {
      example: {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos',
          details: ['Email já cadastrado'],
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, updateUserDto);
  }

  @Patch(':id/gdpr-erasure')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA)
  @Authorize('can_manage_users')
  @ApiOperation({ summary: 'Anonimizar e desativar usuário (LGPD)' })
  @ApiParam({ name: 'id', description: 'ID do usuário', type: String })
  @ApiResponse({
    status: 200,
    description: 'Dados pessoais anonimizados e usuário desativado',
  })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  gdprErasure(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.usersService.gdprErasure(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN_GERAL, Role.ADMIN_EMPRESA)
  @Authorize('can_manage_users')
  @ApiOperation({ summary: 'Excluir usuário' })
  @ApiParam({ name: 'id', description: 'ID do usuário', type: String })
  @ApiResponse({ status: 200, description: 'Usuário excluído com sucesso' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  @ApiResponse({ status: 403, description: 'Sem permissão' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado' })
  remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.usersService.remove(id);
  }
}
