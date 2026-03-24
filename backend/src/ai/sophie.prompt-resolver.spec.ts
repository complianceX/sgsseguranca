import {
  getSophiePromptLayers,
  getSophieSystemPrompt,
} from './sophie.prompt-resolver';

describe('sophie.prompt-resolver', () => {
  it('compõe o prompt em camadas previsíveis', () => {
    const layers = getSophiePromptLayers('apr');

    expect(layers.map((layer) => layer.name)).toEqual([
      'identity',
      'json_policy',
      'task_contract',
    ]);
    expect(layers.every((layer) => layer.content.trim().length > 0)).toBe(true);
  });

  it('inclui a política JSON e o contrato da task no prompt final', () => {
    const prompt = getSophieSystemPrompt('pt');

    expect(prompt).toContain('Política global de saída JSON da SOPHIE');
    expect(prompt).toContain('Modo: Análise de PT.');
    expect(prompt).toContain('Contrato obrigatório de saída');
  });
});
