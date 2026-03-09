import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DocumentRegistryEntry } from '../document-registry/entities/document-registry.entity';
import { EpiAssignment } from '../epi-assignments/entities/epi-assignment.entity';
import { MedicalExam } from '../medical-exams/entities/medical-exam.entity';
import { Training } from '../trainings/entities/training.entity';
import { TenantService } from '../common/tenant/tenant.service';
import { CpfUtil } from '../common/utils/cpf.util';
import { User } from './entities/user.entity';
import {
  WorkerOperationalStatus,
  WorkerOperationalStatusService,
} from './worker-operational-status.service';

type TimelineEventType =
  | 'worker_created'
  | 'medical_exam'
  | 'training'
  | 'epi_assignment'
  | 'document';

type TimelineEventStatus = 'info' | 'success' | 'warning' | 'danger';

export type WorkerTimelineResponse = {
  worker: {
    id: string;
    nome: string;
    cpf: string | null;
    email: string | null;
    funcao: string | null;
    companyId: string;
    companyName: string | null;
    siteId: string | null;
    siteName: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  status: WorkerOperationalStatus;
  summary: {
    trainingsTotal: number;
    expiredTrainings: number;
    activeEpis: number;
    expiringEpis: number;
    medicalExamStatus: WorkerOperationalStatus['medicalExam']['status'];
    relatedDocuments: number;
  };
  documents: Array<{
    id: string;
    module: string;
    title: string;
    documentCode: string | null;
    documentDate: Date | null;
    originalName: string | null;
  }>;
  timeline: Array<{
    id: string;
    type: TimelineEventType;
    title: string;
    description: string;
    status: TimelineEventStatus;
    date: Date;
  }>;
};

@Injectable()
export class WorkerTimelineService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(MedicalExam)
    private readonly medicalExamsRepository: Repository<MedicalExam>,
    @InjectRepository(Training)
    private readonly trainingsRepository: Repository<Training>,
    @InjectRepository(EpiAssignment)
    private readonly epiAssignmentsRepository: Repository<EpiAssignment>,
    @InjectRepository(DocumentRegistryEntry)
    private readonly documentRegistryRepository: Repository<DocumentRegistryEntry>,
    private readonly tenantService: TenantService,
    private readonly workerOperationalStatusService: WorkerOperationalStatusService,
  ) {}

  async getByUserId(userId: string): Promise<WorkerTimelineResponse> {
    const tenantId = this.tenantService.getTenantId();
    const user = await this.usersRepository.findOne({
      where: tenantId ? { id: userId, company_id: tenantId } : { id: userId },
      relations: ['company', 'site'],
    });

    if (!user || user.status === false) {
      throw new NotFoundException('Trabalhador não encontrado.');
    }

    return this.buildTimeline(user);
  }

  async getByCpf(cpf: string): Promise<WorkerTimelineResponse> {
    const normalizedCpf = CpfUtil.normalize(cpf);
    const tenantId = this.tenantService.getTenantId();
    const user = await this.usersRepository.findOne({
      where: tenantId
        ? { cpf: normalizedCpf, company_id: tenantId }
        : { cpf: normalizedCpf },
      relations: ['company', 'site'],
    });

    if (!user || user.status === false) {
      throw new NotFoundException('Trabalhador não encontrado.');
    }

    return this.buildTimeline(user);
  }

  private async buildTimeline(user: User): Promise<WorkerTimelineResponse> {
    const [status, medicalExams, trainings, assignments] = await Promise.all([
      this.workerOperationalStatusService.getByUserId(user.id),
      this.medicalExamsRepository.find({
        where: { user_id: user.id, company_id: user.company_id },
        order: { data_realizacao: 'DESC', created_at: 'DESC' },
        take: 8,
      }),
      this.trainingsRepository.find({
        where: { user_id: user.id, company_id: user.company_id },
        order: { data_vencimento: 'DESC', created_at: 'DESC' },
        take: 12,
      }),
      this.epiAssignmentsRepository.find({
        where: { user_id: user.id, company_id: user.company_id },
        order: { created_at: 'DESC' },
        relations: ['epi'],
        take: 12,
      }),
    ]);

    const relatedEntityIds = [
      ...medicalExams.map((exam) => exam.id),
      ...trainings.map((training) => training.id),
    ];

    const documents = relatedEntityIds.length
      ? await this.documentRegistryRepository.find({
          where: {
            company_id: user.company_id,
            entity_id: In(relatedEntityIds),
          },
          order: {
            document_date: 'DESC',
            created_at: 'DESC',
          },
          take: 12,
        })
      : [];

    const now = new Date();
    const timeline = [
      {
        id: `worker-created-${user.id}`,
        type: 'worker_created' as const,
        title: 'Colaborador cadastrado',
        description: `${user.nome} entrou na base operacional da empresa.`,
        status: 'info' as const,
        date: user.created_at,
      },
      ...medicalExams.map((exam) => ({
        id: `medical-${exam.id}`,
        type: 'medical_exam' as const,
        title: `ASO ${exam.tipo_exame}`,
        description: `${exam.resultado} · vencimento ${
          exam.data_vencimento ? new Date(exam.data_vencimento).toLocaleDateString('pt-BR') : 'não informado'
        }`,
        status:
          exam.resultado === 'inapto'
            ? ('danger' as const)
            : exam.data_vencimento && new Date(exam.data_vencimento) < now
              ? ('warning' as const)
              : ('success' as const),
        date: exam.data_realizacao,
      })),
      ...trainings.map((training) => ({
        id: `training-${training.id}`,
        type: 'training' as const,
        title: training.nome,
        description: `Conclusão ${new Date(training.data_conclusao).toLocaleDateString('pt-BR')} · vencimento ${new Date(training.data_vencimento).toLocaleDateString('pt-BR')}`,
        status:
          new Date(training.data_vencimento) < now
            ? training.bloqueia_operacao_quando_vencido
              ? ('danger' as const)
              : ('warning' as const)
            : ('success' as const),
        date: training.data_vencimento,
      })),
      ...assignments.map((assignment) => ({
        id: `epi-${assignment.id}`,
        type: 'epi_assignment' as const,
        title: `${assignment.epi?.nome || 'EPI'} · ${assignment.status}`,
        description: assignment.validade_ca
          ? `CA válido até ${new Date(assignment.validade_ca).toLocaleDateString('pt-BR')}`
          : 'Sem validade de CA informada',
        status:
          assignment.status === 'devolvido'
            ? ('warning' as const)
            : assignment.validade_ca && new Date(assignment.validade_ca) < now
              ? ('danger' as const)
              : ('info' as const),
        date: assignment.updated_at || assignment.created_at,
      })),
      ...documents.map((document) => ({
        id: `document-${document.id}`,
        type: 'document' as const,
        title: `${document.module.toUpperCase()} · ${document.title}`,
        description: document.document_code || document.original_name || 'Documento consolidado no registry',
        status: 'info' as const,
        date: document.document_date || document.created_at,
      })),
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 30);

    return {
      worker: {
        id: user.id,
        nome: user.nome,
        cpf: user.cpf,
        email: user.email,
        funcao: user.funcao,
        companyId: user.company_id,
        companyName: user.company?.razao_social || null,
        siteId: user.site_id || null,
        siteName: user.site?.nome || null,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
      status,
      summary: {
        trainingsTotal: trainings.length,
        expiredTrainings: trainings.filter(
          (training) => new Date(training.data_vencimento) < now,
        ).length,
        activeEpis: assignments.filter((assignment) => assignment.status === 'entregue').length,
        expiringEpis: assignments.filter(
          (assignment) => assignment.validade_ca && new Date(assignment.validade_ca) < now,
        ).length,
        medicalExamStatus: status.medicalExam.status,
        relatedDocuments: documents.length,
      },
      documents: documents.map((document) => ({
        id: document.id,
        module: document.module,
        title: document.title,
        documentCode: document.document_code,
        documentDate: document.document_date,
        originalName: document.original_name,
      })),
      timeline,
    };
  }
}
