import { DataSource } from 'typeorm';
import { Training } from '../../src/trainings/entities/training.entity';

export type CreateTrainingFactoryInput = {
  nome: string;
  userId: string;
  companyId: string;
  dataConclusao?: Date;
  dataVencimento?: Date;
};

export async function createTraining(
  dataSource: DataSource,
  input: CreateTrainingFactoryInput,
): Promise<Training> {
  const trainingRepo = dataSource.getRepository(Training);

  const dataConclusao = input.dataConclusao || new Date('2026-01-15T00:00:00Z');
  const dataVencimento =
    input.dataVencimento || new Date('2027-01-15T00:00:00Z');

  const training = trainingRepo.create({
    nome: input.nome,
    obrigatorio_para_funcao: true,
    bloqueia_operacao_quando_vencido: true,
    data_conclusao: dataConclusao,
    data_vencimento: dataVencimento,
    user_id: input.userId,
    company_id: input.companyId,
  });

  return trainingRepo.save(training);
}
