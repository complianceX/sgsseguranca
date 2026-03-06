import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Rdo } from './entities/rdo.entity';
import { CreateRdoDto } from './dto/create-rdo.dto';
import { UpdateRdoDto } from './dto/update-rdo.dto';
import { TenantService } from '../common/tenant/tenant.service';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  rascunho: ['enviado'],
  enviado: ['aprovado', 'rascunho'],
  aprovado: [],
};

@Injectable()
export class RdosService {
  constructor(
    @InjectRepository(Rdo)
    private rdosRepository: Repository<Rdo>,
    private tenantService: TenantService,
  ) {}

  private async generateNumero(companyId: string): Promise<string> {
    const now = new Date();
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const count = await this.rdosRepository.count({
      where: { company_id: companyId },
    });
    return `RDO-${yyyymm}-${String(count + 1).padStart(3, '0')}`;
  }

  async create(createRdoDto: CreateRdoDto): Promise<Rdo> {
    const companyId =
      createRdoDto.company_id ?? this.tenantService.getTenantId();
    const numero = await this.generateNumero(companyId!);
    const rdo = this.rdosRepository.create({
      ...createRdoDto,
      company_id: companyId,
      numero,
    });
    return this.rdosRepository.save(rdo);
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    site_id?: string;
    status?: string;
    data_inicio?: string;
    data_fim?: string;
  }): Promise<OffsetPage<Rdo>> {
    const tenantId = this.tenantService.getTenantId();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.rdosRepository
      .createQueryBuilder('rdo')
      .leftJoinAndSelect('rdo.site', 'site')
      .leftJoinAndSelect('rdo.responsavel', 'responsavel')
      .orderBy('rdo.data', 'DESC')
      .addOrderBy('rdo.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (tenantId) {
      qb.andWhere('rdo.company_id = :tenantId', { tenantId });
    }
    if (opts?.site_id) {
      qb.andWhere('rdo.site_id = :siteId', { siteId: opts.site_id });
    }
    if (opts?.status) {
      qb.andWhere('rdo.status = :status', { status: opts.status });
    }
    if (opts?.data_inicio) {
      qb.andWhere('rdo.data >= :dataInicio', { dataInicio: opts.data_inicio });
    }
    if (opts?.data_fim) {
      qb.andWhere('rdo.data <= :dataFim', { dataFim: opts.data_fim });
    }

    const [data, total] = await qb.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  async findOne(id: string): Promise<Rdo> {
    const tenantId = this.tenantService.getTenantId();
    const rdo = await this.rdosRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
      relations: ['site', 'responsavel', 'company'],
    });
    if (!rdo) {
      throw new NotFoundException(`RDO com ID ${id} não encontrado`);
    }
    return rdo;
  }

  async update(id: string, updateRdoDto: UpdateRdoDto): Promise<Rdo> {
    const rdo = await this.findOne(id);
    Object.assign(rdo, updateRdoDto);
    return this.rdosRepository.save(rdo);
  }

  async updateStatus(id: string, newStatus: string): Promise<Rdo> {
    const rdo = await this.findOne(id);
    const allowed = ALLOWED_STATUS_TRANSITIONS[rdo.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Transição de "${rdo.status}" para "${newStatus}" não permitida`,
      );
    }
    rdo.status = newStatus;
    return this.rdosRepository.save(rdo);
  }

  async remove(id: string): Promise<void> {
    const rdo = await this.findOne(id);
    await this.rdosRepository.remove(rdo);
  }

  async exportExcel(): Promise<Buffer> {
    const tenantId = this.tenantService.getTenantId();
    const qb = this.rdosRepository
      .createQueryBuilder('rdo')
      .leftJoinAndSelect('rdo.site', 'site')
      .leftJoinAndSelect('rdo.responsavel', 'responsavel')
      .orderBy('rdo.data', 'DESC');

    if (tenantId) {
      qb.where('rdo.company_id = :tenantId', { tenantId });
    }

    const rdos = await qb.getMany();

    const rows = rdos.map((r) => {
      const totalTrabalhadores = (r.mao_de_obra ?? []).reduce(
        (sum, m) => sum + (m.quantidade ?? 0),
        0,
      );
      return {
        Número: r.numero,
        Data: new Date(r.data).toLocaleDateString('pt-BR'),
        'Obra/Setor': r.site?.nome ?? '',
        Responsável: r.responsavel?.nome ?? '',
        Status: r.status,
        'Total Trabalhadores': totalTrabalhadores,
        'Houve Acidente': r.houve_acidente ? 'Sim' : 'Não',
        'Houve Paralisação': r.houve_paralisacao ? 'Sim' : 'Não',
        Observações: r.observacoes ?? '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RDOs');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }
}
