import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Training } from '../trainings/entities/training.entity';
import { MedicalExam } from '../medical-exams/entities/medical-exam.entity';
import { Dds } from '../dds/entities/dds.entity';
import { Rdo } from '../rdos/entities/rdo.entity';
import { Cat } from '../cats/entities/cat.entity';
import { ServiceOrder } from '../service-orders/entities/service-order.entity';
import { TenantService } from '../common/tenant/tenant.service';

export interface CalendarEvent {
  id: string;
  type: 'training' | 'medical_exam' | 'dds' | 'rdo' | 'cat' | 'service_order';
  title: string;
  date: string; // YYYY-MM-DD
  status?: string;
  subtype?: string;
}

const CALENDAR_MODULE_PERMISSION_MAP = {
  training: 'can_view_trainings',
  medical_exam: 'can_view_medical_exams',
  dds: 'can_view_dds',
  rdo: 'can_view_rdos',
  cat: 'can_view_cats',
  service_order: 'can_view_service_orders',
} as const;

function toDateStr(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class CalendarService {
  constructor(
    @InjectRepository(Training)
    private readonly trainingsRepo: Repository<Training>,
    @InjectRepository(MedicalExam)
    private readonly medicalExamsRepo: Repository<MedicalExam>,
    @InjectRepository(Dds)
    private readonly ddsRepo: Repository<Dds>,
    @InjectRepository(Rdo)
    private readonly rdosRepo: Repository<Rdo>,
    @InjectRepository(Cat)
    private readonly catsRepo: Repository<Cat>,
    @InjectRepository(ServiceOrder)
    private readonly serviceOrdersRepo: Repository<ServiceOrder>,
    private readonly tenantService: TenantService,
  ) {}

  async getEvents(
    year: number,
    month: number,
    permissions: string[] = [],
  ): Promise<CalendarEvent[]> {
    const companyId = this.tenantService.getTenantId();
    if (!companyId) {
      throw new UnauthorizedException(
        'Contexto de empresa não identificado para calendário.',
      );
    }
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    const where = (extra: object) => ({ company_id: companyId, ...extra });
    const permissionSet = new Set(permissions);
    const canViewTrainings = permissionSet.has(
      CALENDAR_MODULE_PERMISSION_MAP.training,
    );
    const canViewMedicalExams = permissionSet.has(
      CALENDAR_MODULE_PERMISSION_MAP.medical_exam,
    );
    const canViewDds = permissionSet.has(CALENDAR_MODULE_PERMISSION_MAP.dds);
    const canViewRdos = permissionSet.has(CALENDAR_MODULE_PERMISSION_MAP.rdo);
    const canViewCats = permissionSet.has(CALENDAR_MODULE_PERMISSION_MAP.cat);
    const canViewServiceOrders = permissionSet.has(
      CALENDAR_MODULE_PERMISSION_MAP.service_order,
    );

    const [
      trainingsConc,
      trainingsVenc,
      examsReal,
      examsVenc,
      ddsList,
      rdoList,
      catList,
      soList,
    ] = await Promise.all([
      canViewTrainings
        ? this.trainingsRepo.find({
            where: where({ data_conclusao: Between(start, end) }),
            select: ['id', 'nome', 'data_conclusao', 'data_vencimento'],
          })
        : Promise.resolve([]),
      canViewTrainings
        ? this.trainingsRepo.find({
            where: where({ data_vencimento: Between(start, end) }),
            select: ['id', 'nome', 'data_conclusao', 'data_vencimento'],
          })
        : Promise.resolve([]),
      canViewMedicalExams
        ? this.medicalExamsRepo.find({
            where: where({ data_realizacao: Between(start, end) }),
            select: [
              'id',
              'tipo_exame',
              'resultado',
              'data_realizacao',
              'data_vencimento',
            ],
          })
        : Promise.resolve([]),
      canViewMedicalExams
        ? this.medicalExamsRepo.find({
            where: where({ data_vencimento: Between(start, end) }),
            select: [
              'id',
              'tipo_exame',
              'resultado',
              'data_realizacao',
              'data_vencimento',
            ],
          })
        : Promise.resolve([]),
      canViewDds
        ? this.ddsRepo.find({
            where: where({ data: Between(start, end) }),
            select: ['id', 'tema', 'data'],
          })
        : Promise.resolve([]),
      canViewRdos
        ? this.rdosRepo.find({
            where: where({ data: Between(start, end) }),
            select: ['id', 'numero', 'data', 'status'],
          })
        : Promise.resolve([]),
      canViewCats
        ? this.catsRepo.find({
            where: where({ data_ocorrencia: Between(start, end) }),
            select: ['id', 'numero', 'data_ocorrencia', 'gravidade', 'status'],
          })
        : Promise.resolve([]),
      canViewServiceOrders
        ? this.serviceOrdersRepo.find({
            where: where({ data_emissao: Between(start, end) }),
            select: ['id', 'numero', 'titulo', 'data_emissao', 'status'],
          })
        : Promise.resolve([]),
    ]);

    const events: CalendarEvent[] = [];

    // Trainings — conclusão
    for (const t of trainingsConc) {
      events.push({
        id: `training-conc-${t.id}`,
        type: 'training',
        title: t.nome,
        date: toDateStr(t.data_conclusao),
        subtype: 'conclusao',
      });
    }

    // Trainings — vencimento (evitar duplicatas com conclusao no mesmo mês)
    const concIds = new Set(trainingsConc.map((t) => t.id));
    for (const t of trainingsVenc) {
      if (!concIds.has(t.id)) {
        events.push({
          id: `training-venc-${t.id}`,
          type: 'training',
          title: `Venc: ${t.nome}`,
          date: toDateStr(t.data_vencimento),
          subtype: 'vencimento',
        });
      }
    }

    // Medical Exams — realização
    for (const e of examsReal) {
      events.push({
        id: `exam-real-${e.id}`,
        type: 'medical_exam',
        title: `Exame: ${e.tipo_exame}`,
        date: toDateStr(e.data_realizacao),
        status: e.resultado,
        subtype: 'realizacao',
      });
    }

    // Medical Exams — vencimento (evitar duplicatas)
    const examRealIds = new Set(examsReal.map((e) => e.id));
    for (const e of examsVenc) {
      if (!examRealIds.has(e.id) && e.data_vencimento) {
        events.push({
          id: `exam-venc-${e.id}`,
          type: 'medical_exam',
          title: `Venc Exame: ${e.tipo_exame}`,
          date: toDateStr(e.data_vencimento),
          status: e.resultado,
          subtype: 'vencimento',
        });
      }
    }

    // DDS
    for (const d of ddsList) {
      events.push({
        id: `dds-${d.id}`,
        type: 'dds',
        title: `DDS: ${d.tema}`,
        date: toDateStr(d.data),
      });
    }

    // RDOs
    for (const r of rdoList) {
      events.push({
        id: `rdo-${r.id}`,
        type: 'rdo',
        title: `RDO ${r.numero}`,
        date: toDateStr(r.data),
        status: r.status,
      });
    }

    // CATs
    for (const c of catList) {
      events.push({
        id: `cat-${c.id}`,
        type: 'cat',
        title: `CAT ${c.numero} (${c.gravidade})`,
        date: toDateStr(c.data_ocorrencia),
        status: c.status,
      });
    }

    // Service Orders
    for (const s of soList) {
      events.push({
        id: `so-${s.id}`,
        type: 'service_order',
        title: `OS ${s.numero}: ${s.titulo}`,
        date: toDateStr(s.data_emissao),
        status: s.status,
      });
    }

    return events.sort((a, b) => a.date.localeCompare(b.date));
  }
}
