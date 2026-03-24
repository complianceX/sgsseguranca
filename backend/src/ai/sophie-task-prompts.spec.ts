import {
  getSophieTaskPrompt,
  SOPHIE_JSON_RUNTIME_INSTRUCTION,
  SOPHIE_TASK_PROMPT_DEFINITIONS,
} from './sophie-task-prompts';
import { SophieTask } from './sophie.types';

describe('sophie-task-prompts', () => {
  it('mantém uma definição para todas as tasks governadas', () => {
    const tasks: SophieTask[] = [
      'insights',
      'apr',
      'pt',
      'checklist',
      'dds',
      'generic',
      'image-analysis',
    ];

    expect(Object.keys(SOPHIE_TASK_PROMPT_DEFINITIONS).sort()).toEqual(
      [...tasks].sort(),
    );
  });

  it('alinha insights ao payload real da IA sem campos do backend', () => {
    const prompt = getSophieTaskPrompt('insights');
    const contractSection = prompt.split('Regras específicas:')[0];

    expect(contractSection).toContain('"summary": string');
    expect(contractSection).not.toContain('safetyScore');
    expect(contractSection).not.toContain('timestamp');
  });

  it('não expõe campos de automação nos contratos brutos de PT e checklist', () => {
    expect(getSophieTaskPrompt('pt')).not.toContain('"automation"');
    expect(getSophieTaskPrompt('checklist')).not.toContain('"automation"');
  });

  it('mantém instrução runtime centralizada para JSON estrito', () => {
    expect(SOPHIE_JSON_RUNTIME_INSTRUCTION).toContain('JSON');
    expect(SOPHIE_JSON_RUNTIME_INSTRUCTION).toContain('sem markdown');
  });
});
