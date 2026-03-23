import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { jsonToExcelBuffer } from '../common/utils/excel.util';
import { MedicalExam } from './entities/medical-exam.entity';
import { CreateMedicalExamDto } from './dto/create-medical-exam.dto';
import { UpdateMedicalExamDto } from './dto/update-medical-exam.dto';
import { TenantService } from '../common/tenant/tenant.service';
import {
  normalizeOffsetPagination,
  OffsetPage,
  toOffsetPage,
} from '../common/utils/offset-pagination.util';

const TIPO_EXAME_LABEL: Record<string, string> = {
  admissional: 'Admissional',
  periodico: 'Periódico',
  retorno: 'Retorno ao Trabalho',
  demissional: 'Demissional',
  mudanca_funcao: 'Mudança de Função',
};

const RESULTADO_LABEL: Record<string, string> = {
  apto: 'Apto',
  inapto: 'Inapto',
  apto_com_restricoes: 'Apto c/ Restrições',
};

@Injectable()
export class MedicalExamsService {
  constructor(
    @InjectRepository(MedicalExam)
    private readonly medicalExamsRepository: Repository<MedicalExam>,
    private readonly tenantService: TenantService,
  ) {}

  async create(dto: CreateMedicalExamDto): Promise<MedicalExam> {
    const tenantId = this.tenantService.getTenantId();
    const exam = this.medicalExamsRepository.create({
      ...dto,
      company_id: tenantId ?? dto.company_id,
    });
    return this.medicalExamsRepository.save(exam);
  }

  async findAll(): Promise<MedicalExam[]> {
    const tenantId = this.tenantService.getTenantId();
    return this.medicalExamsRepository.find({
      where: tenantId ? { company_id: tenantId } : {},
      relations: ['user'],
    });
  }

  async findPaginated(opts?: {
    page?: number;
    limit?: number;
    tipo_exame?: string;
    resultado?: string;
    user_id?: string;
  }): Promise<OffsetPage<MedicalExam>> {
    const tenantId = this.tenantService.getTenantId();
    const { page, limit, skip } = normalizeOffsetPagination(opts, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const qb = this.medicalExamsRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.user', 'user')
      .orderBy('exam.data_vencimento', 'ASC')
      .skip(skip)
      .take(limit);

    if (tenantId) qb.where('exam.company_id = :tenantId', { tenantId });
    if (opts?.tipo_exame)
      qb.andWhere('exam.tipo_exame = :tipo_exame', {
        tipo_exame: opts.tipo_exame,
      });
    if (opts?.resultado)
      qb.andWhere('exam.resultado = :resultado', { resultado: opts.resultado });
    if (opts?.user_id)
      qb.andWhere('exam.user_id = :user_id', { user_id: opts.user_id });

    const [data, total] = await qb.getManyAndCount();
    return toOffsetPage(data, total, page, limit);
  }

  async findOne(id: string): Promise<MedicalExam> {
    const tenantId = this.tenantService.getTenantId();
    const exam = await this.medicalExamsRepository.findOne({
      where: tenantId ? { id, company_id: tenantId } : { id },
      relations: ['user'],
    });
    if (!exam) {
      throw new NotFoundException(`Exame médico com ID ${id} não encontrado`);
    }
    return exam;
  }

  async update(id: string, dto: UpdateMedicalExamDto): Promise<MedicalExam> {
    const exam = await this.findOne(id);
    Object.assign(exam, dto);
    return this.medicalExamsRepository.save(exam);
  }

  async remove(id: string): Promise<void> {
    const exam = await this.findOne(id);
    await this.medicalExamsRepository.remove(exam);
  }

  async findExpirySummary() {
    const tenantId = this.tenantService.getTenantId();
    const exams = await this.medicalExamsRepository.find({
      where: tenantId ? { company_id: tenantId } : {},
    });

    const now = new Date();
    const withVencimento = exams.filter((e) => e.data_vencimento !== null);
    const expired = withVencimento.filter(
      (e) => new Date(e.data_vencimento!) < now,
    ).length;
    const expiringSoon = withVencimento.filter((e) => {
      const diff = new Date(e.data_vencimento!).getTime() - now.getTime();
      const days = diff / (1000 * 60 * 60 * 24);
      return days > 0 && days <= 30;
    }).length;

    return {
      total: exams.length,
      expired,
      expiringSoon,
      valid: withVencimento.length - expired - expiringSoon,
    };
  }

  async findExpiring(days: number): Promise<MedicalExam[]> {
    const tenantId = this.tenantService.getTenantId();
    const now = new Date();
    const future = new Date();
    future.setDate(now.getDate() + days);

    const qb = this.medicalExamsRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.user', 'user')
      .where('exam.data_vencimento BETWEEN :now AND :future', { now, future });

    if (tenantId) qb.andWhere('exam.company_id = :tenantId', { tenantId });

    return qb.getMany();
  }

  async dispatchExpiryNotifications(days: number) {
    const expiring = await this.findExpiring(days);
    return {
      dispatched: expiring.length,
      timestamp: new Date(),
    };
  }

  async exportExcel(): Promise<Buffer> {
    const tenantId = this.tenantService.getTenantId();
    const qb = this.medicalExamsRepository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.user', 'user')
      .orderBy('exam.data_vencimento', 'ASC');
    if (tenantId) qb.where('exam.company_id = :tenantId', { tenantId });
    const exams = await qb.getMany();

    const now = new Date();
    const rows = exams.map((e) => {
      const venc = e.data_vencimento ? new Date(e.data_vencimento) : null;
      const statusVenc = !venc
        ? 'Sem vencimento'
        : venc < now
          ? 'Vencido'
          : (venc.getTime() - now.getTime()) / (1000 * 60 * 60 * 24) <= 30
            ? 'Vencendo em breve'
            : 'Em dia';
      return {
        Funcionário: e.user?.nome ?? '',
        Tipo: TIPO_EXAME_LABEL[e.tipo_exame] ?? e.tipo_exame,
        Resultado: RESULTADO_LABEL[e.resultado] ?? e.resultado,
        'Data Realização': new Date(e.data_realizacao).toLocaleDateString(
          'pt-BR',
        ),
        Vencimento: venc ? venc.toLocaleDateString('pt-BR') : '',
        'Status Vencimento': statusVenc,
        Médico: e.medico_responsavel ?? '',
        CRM: e.crm_medico ?? '',
      };
    });

    return jsonToExcelBuffer(rows, 'Exames');
  }
}
