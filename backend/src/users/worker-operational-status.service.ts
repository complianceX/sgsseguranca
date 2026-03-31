import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EpiAssignment } from '../epi-assignments/entities/epi-assignment.entity';
import { MedicalExam } from '../medical-exams/entities/medical-exam.entity';
import { Training } from '../trainings/entities/training.entity';
import { CpfUtil } from '../common/utils/cpf.util';
import { User } from './entities/user.entity';

export interface WorkerOperationalStatus {
  user: {
    id: string;
    nome: string;
    cpf: string | null;
    funcao?: string | null;
    company_id: string;
  };
  operationalStatus: 'APTO' | 'BLOQUEADO';
  blocked: boolean;
  reasons: string[];
  medicalExam: {
    status: 'VALIDO' | 'VENCIDO' | 'INAPTO' | 'AUSENTE';
    data_realizacao?: Date | null;
    data_vencimento?: Date | null;
    resultado?: string | null;
  };
  trainings: {
    total: number;
    expiredBlocking: Array<{
      id: string;
      nome: string;
      data_vencimento: Date;
    }>;
  };
  epis: {
    totalActive: number;
    expiringCa: Array<{
      id: string;
      epiNome?: string;
      validade_ca?: Date;
    }>;
  };
}

type WorkerOperationalData = {
  latestMedicalExam: MedicalExam | null;
  trainings: Training[];
  activeAssignments: EpiAssignment[];
};

@Injectable()
export class WorkerOperationalStatusService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(MedicalExam)
    private readonly medicalExamsRepository: Repository<MedicalExam>,
    @InjectRepository(Training)
    private readonly trainingsRepository: Repository<Training>,
    @InjectRepository(EpiAssignment)
    private readonly epiAssignmentsRepository: Repository<EpiAssignment>,
  ) {}

  async getByCpf(cpf: string): Promise<WorkerOperationalStatus> {
    const normalizedCpf = CpfUtil.normalize(cpf);
    const user = await this.usersRepository.findOne({
      where: { cpf: normalizedCpf },
      select: ['id', 'nome', 'cpf', 'funcao', 'company_id', 'status'],
    });

    if (!user || user.status === false) {
      throw new NotFoundException('Trabalhador não encontrado.');
    }

    return this.buildStatusFromUser(user);
  }

  async getByUserId(userId: string): Promise<WorkerOperationalStatus> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: ['id', 'nome', 'cpf', 'funcao', 'company_id', 'status'],
    });

    if (!user || user.status === false) {
      throw new NotFoundException('Trabalhador não encontrado.');
    }

    return this.buildStatusFromUser(user);
  }

  async getByUserIds(
    userIds: string[],
  ): Promise<Map<string, WorkerOperationalStatus>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const users = await this.usersRepository.find({
      where: { id: In(userIds) },
      select: ['id', 'nome', 'cpf', 'funcao', 'company_id', 'status'],
    });

    const activeUsers = users.filter((user) => user.status !== false);
    if (activeUsers.length === 0) {
      return new Map();
    }

    const userIdsToLoad = activeUsers.map((user) => user.id);
    const companyIdsToLoad = Array.from(
      new Set(activeUsers.map((user) => user.company_id)),
    );
    const [medicalExams, trainings, activeAssignments] = await Promise.all([
      this.medicalExamsRepository.find({
        where: {
          user_id: In(userIdsToLoad),
          company_id: In(companyIdsToLoad),
        },
        order: { data_realizacao: 'DESC', created_at: 'DESC' },
      }),
      this.trainingsRepository.find({
        where: {
          user_id: In(userIdsToLoad),
          company_id: In(companyIdsToLoad),
        },
        order: { data_vencimento: 'ASC' },
      }),
      this.epiAssignmentsRepository.find({
        where: {
          user_id: In(userIdsToLoad),
          company_id: In(companyIdsToLoad),
          status: 'entregue',
        },
        relations: ['epi'],
        order: { created_at: 'DESC' },
      }),
    ]);

    const latestMedicalByUserId = new Map<string, MedicalExam>();
    for (const exam of medicalExams) {
      if (!latestMedicalByUserId.has(exam.user_id)) {
        latestMedicalByUserId.set(exam.user_id, exam);
      }
    }

    const trainingsByUserId = new Map<string, Training[]>();
    for (const training of trainings) {
      const bucket = trainingsByUserId.get(training.user_id) || [];
      bucket.push(training);
      trainingsByUserId.set(training.user_id, bucket);
    }

    const assignmentsByUserId = new Map<string, EpiAssignment[]>();
    for (const assignment of activeAssignments) {
      const bucket = assignmentsByUserId.get(assignment.user_id) || [];
      bucket.push(assignment);
      assignmentsByUserId.set(assignment.user_id, bucket);
    }

    const statuses = activeUsers.map((user) =>
      this.buildStatusFromLoadedData(user, {
        latestMedicalExam: latestMedicalByUserId.get(user.id) || null,
        trainings: trainingsByUserId.get(user.id) || [],
        activeAssignments: assignmentsByUserId.get(user.id) || [],
      }),
    );

    return new Map(statuses.map((status) => [status.user.id, status]));
  }

  private async buildStatusFromUser(user: User): Promise<WorkerOperationalStatus> {
    const [latestMedicalExam, trainings, activeAssignments] = await Promise.all(
      [
        this.medicalExamsRepository.findOne({
          where: { user_id: user.id, company_id: user.company_id },
          order: { data_realizacao: 'DESC', created_at: 'DESC' },
        }),
        this.trainingsRepository.find({
          where: { user_id: user.id, company_id: user.company_id },
          order: { data_vencimento: 'ASC' },
        }),
        this.epiAssignmentsRepository.find({
          where: {
            user_id: user.id,
            company_id: user.company_id,
            status: 'entregue',
          },
          relations: ['epi'],
          order: { created_at: 'DESC' },
        }),
      ],
    );

    return this.buildStatusFromLoadedData(user, {
      latestMedicalExam,
      trainings,
      activeAssignments,
    });
  }

  buildStatusFromLoadedData(
    user: Pick<User, 'id' | 'nome' | 'cpf' | 'funcao' | 'company_id'>,
    data: WorkerOperationalData,
  ): WorkerOperationalStatus {
    const { latestMedicalExam, trainings, activeAssignments } = data;

    const now = new Date();
    const reasons: string[] = [];

    let medicalStatus: WorkerOperationalStatus['medicalExam']['status'] =
      'AUSENTE';
    if (!latestMedicalExam) {
      reasons.push('ASO ausente.');
    } else if (latestMedicalExam.resultado === 'inapto') {
      medicalStatus = 'INAPTO';
      reasons.push('ASO inapto.');
    } else if (
      latestMedicalExam.data_vencimento &&
      new Date(latestMedicalExam.data_vencimento) < now
    ) {
      medicalStatus = 'VENCIDO';
      reasons.push('ASO vencido.');
    } else {
      medicalStatus = 'VALIDO';
    }

    const expiredBlocking = trainings
      .filter(
        (training) =>
          training.bloqueia_operacao_quando_vencido &&
          training.data_vencimento &&
          new Date(training.data_vencimento) < now,
      )
      .map((training) => ({
        id: training.id,
        nome: training.nome,
        data_vencimento: training.data_vencimento,
      }));

    if (expiredBlocking.length > 0) {
      reasons.push(
        `Treinamentos vencidos: ${expiredBlocking.map((item) => item.nome).join(', ')}.`,
      );
    }

    const expiringCa = activeAssignments
      .filter(
        (assignment) =>
          assignment.validade_ca && new Date(assignment.validade_ca) < now,
      )
      .map((assignment) => ({
        id: assignment.id,
        epiNome: assignment.epi?.nome,
        validade_ca: assignment.validade_ca,
      }));

    return {
      user: {
        id: user.id,
        nome: user.nome,
        cpf: user.cpf,
        funcao: user.funcao,
        company_id: user.company_id,
      },
      operationalStatus: reasons.length > 0 ? 'BLOQUEADO' : 'APTO',
      blocked: reasons.length > 0,
      reasons,
      medicalExam: {
        status: medicalStatus,
        data_realizacao: latestMedicalExam?.data_realizacao ?? null,
        data_vencimento: latestMedicalExam?.data_vencimento ?? null,
        resultado: latestMedicalExam?.resultado ?? null,
      },
      trainings: {
        total: trainings.length,
        expiredBlocking,
      },
      epis: {
        totalActive: activeAssignments.length,
        expiringCa,
      },
    };
  }
}
