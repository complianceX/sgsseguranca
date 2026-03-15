import { SOPHIE_SYSTEM_PROMPT } from './sophie.prompts';
import {
  SOPHIE_APR_PROMPT,
  SOPHIE_CHECKLIST_PROMPT,
  SOPHIE_DDS_PROMPT,
  SOPHIE_GENERIC_JSON_PROMPT,
  SOPHIE_IMAGE_ANALYSIS_PROMPT,
  SOPHIE_INSIGHTS_PROMPT,
  SOPHIE_PT_PROMPT,
} from './sophie-task-prompts';
import { SophieTask } from './sophie.types';

const TASK_PROMPTS: Record<SophieTask, string> = {
  insights: SOPHIE_INSIGHTS_PROMPT,
  apr: SOPHIE_APR_PROMPT,
  pt: SOPHIE_PT_PROMPT,
  checklist: SOPHIE_CHECKLIST_PROMPT,
  dds: SOPHIE_DDS_PROMPT,
  generic: SOPHIE_GENERIC_JSON_PROMPT,
  'image-analysis': SOPHIE_IMAGE_ANALYSIS_PROMPT,
};

export function getSophieSystemPrompt(task: SophieTask): string {
  return `${SOPHIE_SYSTEM_PROMPT}\n\n${TASK_PROMPTS[task] || SOPHIE_GENERIC_JSON_PROMPT}`;
}
