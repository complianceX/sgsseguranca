import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { InspectionResponseDto } from './inspection-response.dto';

describe('InspectionResponseDto', () => {
  it('exposes company summary when relation data is loaded', () => {
    const dto = plainToInstance(
      InspectionResponseDto,
      {
        id: 'inspection-1',
        company_id: 'company-1',
        company: {
          id: 'company-1',
          razao_social: 'Gandra Tecnologia',
          cnpj: '00.000.000/0001-00',
        },
      },
      { excludeExtraneousValues: true },
    );

    expect(dto.company).toEqual({
      id: 'company-1',
      razao_social: 'Gandra Tecnologia',
    });
  });

  it('exposes typed nested collections without leaking unknown fields', () => {
    const dto = plainToInstance(
      InspectionResponseDto,
      {
        id: 'inspection-1',
        company_id: 'company-1',
        perigos_riscos: [
          {
            grupo_risco: 'Acidente',
            perigo_fator_risco: 'Queda de altura',
            fonte_circunstancia: 'Abertura lateral',
            trabalhadores_expostos: 'Equipe de manutenção',
            tipo_exposicao: 'Ocasional',
            medidas_existentes: 'Sinalização',
            severidade: 'Alta',
            probabilidade: 'Média',
            nivel_risco: 'Alto',
            classificacao_risco: 'Substancial',
            acoes_necessarias: 'Instalar guarda-corpo',
            prazo: '2026-03-20',
            responsavel: 'Supervisor',
            debugOnly: 'não deve sair',
          },
        ],
        plano_acao: [
          {
            acao: 'Instalar guarda-corpo',
            responsavel: 'Supervisor',
            prazo: '2026-03-20',
            status: 'Pendente',
            internal: 'não deve sair',
          },
        ],
        evidencias: [
          {
            descricao: 'Foto do desvio',
            url: 'https://storage.example/evidencia.jpg',
            original_name: 'evidencia.jpg',
            secret: 'não deve sair',
          },
        ],
      },
      { excludeExtraneousValues: true },
    );

    expect(dto.perigos_riscos).toEqual([
      {
        grupo_risco: 'Acidente',
        perigo_fator_risco: 'Queda de altura',
        fonte_circunstancia: 'Abertura lateral',
        trabalhadores_expostos: 'Equipe de manutenção',
        tipo_exposicao: 'Ocasional',
        medidas_existentes: 'Sinalização',
        severidade: 'Alta',
        probabilidade: 'Média',
        nivel_risco: 'Alto',
        classificacao_risco: 'Substancial',
        acoes_necessarias: 'Instalar guarda-corpo',
        prazo: '2026-03-20',
        responsavel: 'Supervisor',
      },
    ]);
    expect(dto.plano_acao).toEqual([
      {
        acao: 'Instalar guarda-corpo',
        responsavel: 'Supervisor',
        prazo: '2026-03-20',
        status: 'Pendente',
      },
    ]);
    expect(dto.evidencias).toEqual([
      {
        descricao: 'Foto do desvio',
        url: 'https://storage.example/evidencia.jpg',
        original_name: 'evidencia.jpg',
      },
    ]);
  });
});
