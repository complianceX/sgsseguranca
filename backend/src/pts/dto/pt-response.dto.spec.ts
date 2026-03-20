import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { PtResponseDto } from './pt-response.dto';

describe('PtResponseDto', () => {
  it('exposes typed nested relations and checklist collections', () => {
    const dto = plainToInstance(
      PtResponseDto,
      {
        id: 'pt-1',
        numero: 'PT-001',
        titulo: 'Manutenção elétrica',
        company_id: 'company-1',
        site_id: 'site-1',
        responsavel_id: 'user-1',
        status: 'Pendente',
        trabalho_altura: false,
        espaco_confinado: false,
        trabalho_quente: false,
        eletricidade: true,
        escavacao: false,
        executantes: [
          {
            id: 'user-2',
            nome: 'Executor 1',
            email: 'executor@example.com',
            cpf: '00000000000',
            funcao: 'Eletricista',
            company_id: 'company-1',
            site_id: 'site-1',
            profile_id: 'profile-1',
            profile: { id: 'profile-1', nome: 'TST' },
            status: true,
            created_at: new Date('2026-03-19T10:00:00.000Z'),
            updated_at: new Date('2026-03-19T10:00:00.000Z'),
            internalOnly: 'não deve sair',
          },
        ],
        apr: {
          id: 'apr-1',
          numero: 'APR-001',
          titulo: 'APR da atividade',
          status: 'Aprovada',
          hidden: 'não deve sair',
        },
        trabalho_eletrico_checklist: [
          {
            id: 'nr10',
            pergunta: 'Equipe autorizada NR-10?',
            resposta: 'Sim',
            justificativa: 'Equipe validada',
            anexo_nome: 'evidencia.png',
            debugOnly: 'não deve sair',
          },
        ],
      },
      { excludeExtraneousValues: true },
    );

    expect(dto.executantes).toEqual([
      expect.objectContaining({
        id: 'user-2',
        nome: 'Executor 1',
        email: 'executor@example.com',
      }),
    ]);
    expect(dto.apr).toEqual({
      id: 'apr-1',
      numero: 'APR-001',
      titulo: 'APR da atividade',
      status: 'Aprovada',
    });
    expect(dto.trabalho_eletrico_checklist).toEqual([
      {
        id: 'nr10',
        pergunta: 'Equipe autorizada NR-10?',
        resposta: 'Sim',
        justificativa: 'Equipe validada',
        anexo_nome: 'evidencia.png',
      },
    ]);
  });
});
