import { SOPHIE_SYSTEM_PROMPT } from './sophie.prompts';
import {
  SOPHIE_JSON_OUTPUT_POLICY,
  getSophieTaskPrompt,
} from './sophie-task-prompts';
import { SophieTask } from './sophie.types';

export type SophiePromptLayer = {
  name: 'identity' | 'json_policy' | 'task_contract';
  content: string;
};

export function getSophiePromptLayers(task: SophieTask): SophiePromptLayer[] {
  const layers: SophiePromptLayer[] = [
    {
      name: 'identity',
      content: SOPHIE_SYSTEM_PROMPT,
    },
    {
      name: 'json_policy',
      content: SOPHIE_JSON_OUTPUT_POLICY,
    },
    {
      name: 'task_contract',
      content: getSophieTaskPrompt(task),
    },
  ];

  return layers.filter((layer) => Boolean(layer.content?.trim()));
}

export function getSophieSystemPrompt(task: SophieTask): string {
  return getSophiePromptLayers(task)
    .map((layer) => layer.content)
    .join('\n\n');
}
