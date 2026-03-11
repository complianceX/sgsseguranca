import React from 'react';
import { type Path, useFieldArray, useFormContext } from 'react-hook-form';
import { cn } from '@/lib/utils';
import type { PtFormData } from './pt-schema-and-data';

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
  const { fields } = useFieldArray({
    control,
    name,
  });

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
    <div className="sst-card p-6 transition-shadow hover:shadow-md">
      <h2 className="mb-2 text-lg font-bold text-gray-900">{title}</h2>
      <p className="mb-6 text-sm text-gray-600">{description}</p>
      <div className="space-y-4">
        {fields.map((item, index) => {
          const questionInfo = questions.find(q => q.id === item.id);
          const field = item as ChecklistItem;
          const responseError = getError(index, 'resposta');
          const justificationError = getError(index, 'justificativa');

          const responses = questionInfo?.allowNA ? baseResponses : baseResponses.filter(r => r !== 'Não aplicável');

          return (
            <div key={item.id} className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm font-semibold text-gray-800">
                {questionInfo?.pergunta}
                {!questionInfo?.optional && <span className="text-red-500"> *</span>}
              </p>

              {/* Respostas (Radio) */}
              <div className="mt-3 flex flex-wrap gap-4">
                {responses.map(responseValue => (
                  <label key={responseValue} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name={`${name}-${index}`}
                      checked={field.resposta === responseValue}
                      onChange={() => setValue(`${name}.${index}.resposta`, responseValue, { shouldValidate: true })}
                      className="h-4 w-4 text-[var(--ds-color-text-primary)] focus:ring-blue-500"
                    />
                    <span>{responseValue}</span>
                  </label>
                ))}
              </div>
              {responseError && <p className="mt-2 text-xs text-red-500">{responseError}</p>}

              {/* Justificativa */}
              {field.resposta && showJustificationOn.some((value) => value === field.resposta) && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Justificativa <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={field.justificativa || ''}
                    onChange={(e) => setValue(`${name}.${index}.justificativa`, e.target.value, { shouldValidate: true })}
                    rows={3}
                    className={cn("block w-full rounded-md border px-3 py-2 text-xs", justificationError ? "border-red-500 bg-red-50" : "border-gray-300")}
                    placeholder="Explique o motivo da resposta."
                  />
                  {justificationError && <p className="mt-2 text-xs text-red-500">{justificationError}</p>}
                </div>
              )}

              {/* Anexo (se aplicável) */}
              {hasAttachmentField(name) && (
                 <div className="mt-3">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Anexo (opcional)</label>
                    <input
                      type="file"
                      onChange={(e) =>
                        setValue(
                          `${name}.${index}.anexo_nome` as Path<PtFormData>,
                          e.target.files?.[0]?.name,
                          { shouldValidate: false },
                        )
                      }
                      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-xs"
                    />
                    <p className="mt-1 text-[11px] text-gray-500">
                      {field.anexo_nome ? `Arquivo selecionado: ${field.anexo_nome}` : "Nenhum ficheiro selecionado"}
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
