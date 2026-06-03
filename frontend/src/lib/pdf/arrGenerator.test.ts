import type { Arr } from '@/services/arrsService';
import { generateArrPdf } from './arrGenerator';

const baseArr: Arr = {
  id: 'arr-1',
  titulo: 'ARR Trabalho em Altura',
  data: '2026-04-19',
  status: 'tratada',
  company_id: 'company-1',
  site_id: 'site-1',
  responsavel_id: 'user-1',
  atividade_principal: 'Montagem',
  condicao_observada: 'Sem linha de vida',
  risco_identificado: 'Queda de trabalhador',
  nivel_risco: 'alto',
  probabilidade: 'alta',
  severidade: 'grave',
  controles_imediatos: 'Isolar área',
  participants: [],
  created_at: '2026-04-19T09:00:00.000Z',
  updated_at: '2026-04-19T10:00:00.000Z',
  company: { id: 'company-1', razao_social: 'Gandra Tecnologia' },
  site: { id: 'site-1', nome: 'Obra Central' },
};

describe('arrGenerator', () => {
  it('gera o PDF da ARR sem quebrar e com filename esperado', async () => {
    const base64 = (await generateArrPdf(baseArr, {
      save: false,
      output: 'base64',
    })) as string;

    expect(base64.length).toBeGreaterThan(100);
  });

  it('usa document_code governado quando disponível', async () => {
    const base64 = (await generateArrPdf(
      {
        ...baseArr,
        document_code: 'ARR-2026-TRACE123',
        pdf_generated_at: '2026-04-19T12:00:00.000Z',
        emitted_by: { nome: 'Tecnico SST' },
      },
      {
        save: false,
        output: 'base64',
      },
    )) as string;

    expect(base64.length).toBeGreaterThan(100);
  });
});
