import React from 'react';
import { type Path, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { cn } from '@/lib/utils';
import type { PtFormData } from './pt-schema-and-data';
import { StatusPill } from '@/components/ui/status-pill';

type ChecklistResponse = 'Sim' | 'Não' | 'Não aplicável' | 'Ciente';
type ChecklistFieldName =
  | 'recomendacoes_gerais_checklist'
  | 'trabalho_altura_checklist'
  | 'trabalho_eletrico_checklist'
  | 'trabalho_quente_checklist'
  | 'trabalho_espaco_confinado_checklist'
  | 'trabalho_escavacao_checklist';
type AttachableChecklistFieldName = Exclude<ChecklistFieldName, 'recomendacoes_gerais_checklist'>;

interface ChecklistItem {
  id: string;
  pergunta: string;
  resposta?: 'Sim' | 'Não' | 'Não aplicável' | 'Ciente';
  justificativa?: string;
  anexo_nome?: string;
  allowNA?: boolean;
  optional?: boolean;
}

interface ChecklistSectionProps {
  name: ChecklistFieldName;
  title: string;
  description: string;
  questions: ChecklistItem[];
  baseResponses: ChecklistResponse[];
  showJustificationOn: ('Não' | 'Não aplicável')[];
}

const ChecklistSection: React.FC<ChecklistSectionProps> = ({
  name,
  title,
  description,
  questions,
  baseResponses,
  showJustificationOn,
}) => {
  const { control, formState: { errors }, setValue } = useFormContext<PtFormData>();
  const { fields } = useFieldArray({ control, name });
  const watchedItems = useWatch({ control, name }) as Array<{ resposta?: string }> | undefined;
  const answeredCount = (watchedItems ?? []).filter((item) => item?.resposta).length;
  const totalCount = fields.length;

  type ChecklistItemError = {
    resposta?: { message?: unknown };
    justificativa?: { message?: unknown };
  };

  const getError = (index: number, fieldName: 'resposta' | 'justificativa') => {
    const sectionErrors = errors[name] as unknown;
    if (!Array.isArray(sectionErrors)) return null;
    const itemError = sectionErrors[index];
    if (!itemError || typeof itemError !== 'object') return null;
    const message = (itemError as ChecklistItemError)[fieldName]?.message;
    return typeof message === 'string' ? message : null;
  };

  const hasAttachmentField = (fieldName: ChecklistFieldName): fieldName is AttachableChecklistFieldName => (
    fieldName.startsWith('trabalho_')
  );

  return (
    <div className="ds-form-section">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--ds-color-text-primary)]">{title}</h2>
        <StatusPill tone={answeredCount === totalCount ? 'success' : 'warning'}>
          {answeredCount}/{totalCount}
        </StatusPill>
      </div>
      <p className="mb-6 text-sm text-[var(--ds-color-text-secondary)]">{description}</p>
      <div className="space-y-4">
        {fields.map((item, index) => {
          const questionInfo = questions.find(q => q.id === item.id);
          const field = item as ChecklistItem;
          const responseError = getError(index, 'resposta');
          const justificationError = getError(index, 'justificativa');
          const prompt = questionInfo?.pergunta ?? field.pergunta;
          const allowsNA =
            questionInfo?.allowNA ??
            field.allowNA ??
            field.resposta === 'Não aplicável';
          const isOptional = questionInfo?.optional ?? field.optional ?? false;
          const responses = allowsNA
            ? baseResponses
            : baseResponses.filter(r => r !== 'Não aplicável');

          return (
            <div
              key={item.id}
              className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)]/14 p-4"
            >
              <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
                {prompt}
                {!isOptional && <span className="text-[var(--color-danger)]"> *</span>}
              </p>

              {/* Respostas (Radio) */}
              <div className="mt-3 flex flex-wrap gap-4">
                {responses.map(responseValue => (
                  <label
                    key={responseValue}
                    className="flex items-center gap-2 text-sm text-[var(--ds-color-text-secondary)]"
                  >
                    <input
                      type="radio"
                      name={`${name}-${index}`}
                      checked={field.resposta === responseValue}
                      onChange={() => setValue(`${name}.${index}.resposta`, responseValue, { shouldValidate: true })}
                      className="h-4 w-4 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                    />
                    <span>{responseValue}</span>
                  </label>
                ))}
              </div>
              {responseError && <p className="mt-2 text-xs text-[var(--color-danger)]">{responseError}</p>}

              {/* Justificativa */}
              {field.resposta && showJustificationOn.some((value) => value === field.resposta) && (
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                    Justificativa <span className="text-[var(--color-danger)]">*</span>
                  </label>
                  <textarea
                    value={field.justificativa || ''}
                    onChange={(e) => setValue(`${name}.${index}.justificativa`, e.target.value, { shouldValidate: true })}
                    rows={3}
                    className={cn(
                      'block w-full rounded-[var(--ds-radius-md)] border bg-[var(--ds-color-surface-base)] px-3 py-2 text-xs text-[var(--ds-color-text-primary)] transition-all focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]',
                      justificationError
                        ? 'border-[color:var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger-subtle)]/40'
                        : 'border-[var(--ds-color-border-subtle)]',
                    )}
                    placeholder="Explique o motivo da resposta."
                  />
                  {justificationError && <p className="mt-2 text-xs text-[var(--color-danger)]">{justificationError}</p>}
                </div>
              )}

              {/* Anexo (se aplicável) */}
              {hasAttachmentField(name) && (
                 <div className="mt-3">
                    <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
                      Anexo (opcional)
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const MAX_SIZE_MB = 5;
                        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
                          e.target.value = '';
                          alert(`O arquivo deve ter no máximo ${MAX_SIZE_MB}MB.`);
                          return;
                        }
                        setValue(
                          `${name}.${index}.anexo_nome` as Path<PtFormData>,
                          file.name,
                          { shouldValidate: true },
                        );
                      }}
                      className="block w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-xs text-[var(--ds-color-text-primary)]"
                    />
                    <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                      {field.anexo_nome ? `Arquivo selecionado: ${field.anexo_nome}` : 'Nenhum ficheiro selecionado — PDF, JPG ou PNG até 5 MB'}
                    </p>
                  </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(ChecklistSection);
