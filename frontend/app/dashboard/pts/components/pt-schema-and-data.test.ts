import {
  confinadoQuestions,
  eletricoQuestions,
  escavacaoQuestions,
  recomendacoesQuestions,
} from './pt-schema-and-data';

describe('pt checklist definitions', () => {
  it('keeps the general recommendations operational and explicit', () => {
    expect(recomendacoesQuestions.map((item) => item.id)).toEqual([
      'direito_recusa_risco_grave',
      'alteracao_invalida_pt',
      'pt_documentos_disponiveis',
      'somente_pessoas_autorizadas',
    ]);
  });

  it('includes critical electrical, confined-space and excavation checks aligned with the latest review', () => {
    expect(eletricoQuestions.some((item) => item.id === 'profissionais_autorizados_nr10')).toBe(true);
    expect(confinadoQuestions.some((item) => item.id === 'entrada_sinalizada_controlada')).toBe(true);
    expect(escavacaoQuestions.some((item) => item.id === 'responsavel_tecnico_escavacao')).toBe(true);
    expect(
      escavacaoQuestions.find((item) => item.id === 'escoramento_nr18')?.pergunta,
    ).toContain('1,25m');
  });
});
