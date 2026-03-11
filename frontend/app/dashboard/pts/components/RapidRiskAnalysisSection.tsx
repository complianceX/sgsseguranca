import React, { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { cn } from '@/lib/utils';
import { initialChecklists } from './pt-schema-and-data';

type RapidRiskChecklistAnswer = 'Sim' | 'Não';

export const RapidRiskAnalysisSection = () => {
  const { watch, setValue, formState: { errors } } = useFormContext();
  
  const rapidRiskChecklist = watch('analise_risco_rapida_checklist');
  const rapidRiskObservacoes = watch('analise_risco_rapida_observacoes');

  const hasRapidRiskBasicNo = useMemo(
    () =>
      (rapidRiskChecklist || []).some(
        (item: any) => item.secao === 'basica' && item.resposta === 'Não',
      ),
    [rapidRiskChecklist],
  );

  const setRapidRiskChecklistAnswer = (index: number, resposta: RapidRiskChecklistAnswer) => {
      const currentList = rapidRiskChecklist || initialChecklists.analise_risco_rapida_checklist;
      const updated = [...currentList];
      updated[index] = { ...updated[index], resposta };
      setValue('analise_risco_rapida_checklist', updated, {
        shouldValidate: true,
      });
  };

  return (
    <div className="sst-card p-6 transition-shadow hover:shadow-md">
      <h2 className="mb-2 text-lg font-bold text-gray-900 flex items-center gap-2">
        Análise de Risco Rápida
        <span className="h-2 w-2 rounded-full bg-cyan-500"></span>
      </h2>
      <p className="mb-4 text-sm text-gray-600">
        Se respondeu &quot;Não&quot; em alguma verificação básica, o trabalho não deve
        começar sem medidas corretivas implementadas.
      </p>
      <p className="mb-6 text-sm text-gray-600">
        Documente e comprove as medidas no campo de observações deste
        formulário (ou formalize por e-mail).
      </p>

      {hasRapidRiskBasicNo && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Foi identificado pelo menos um &quot;Não&quot; nas verificações básicas.
          Registre as ações corretivas em observações antes de continuar.
        </div>
      )}

      <div className="space-y-6">
        {(['basica', 'adicional'] as const).map((secao) => {
          const tituloSecao =
            secao === 'basica'
              ? 'Verificações'
              : 'Verificações adicionais';
          
          const sectionItems = (rapidRiskChecklist || [])
            .map((item: any, index: number) => ({ item, index }))
            .filter(({ item }: any) => item.secao === secao);

          return (
            <div key={secao} className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
                {tituloSecao}
              </h3>

              {sectionItems.map(({ item, index }: any) => {
                const answerError =
                  errors.analise_risco_rapida_checklist &&
                  Array.isArray(errors.analise_risco_rapida_checklist) &&
                  (errors.analise_risco_rapida_checklist as any)[index]?.resposta
                    ?.message;

                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-gray-200 p-4"
                  >
                    <p className="text-sm font-semibold text-gray-800">
                      {item.pergunta} <span className="text-red-500">*</span>
                    </p>

                    <div className="mt-3 flex flex-wrap gap-4">
                      {(['Sim', 'Não'] as RapidRiskChecklistAnswer[]).map(
                        (option) => (
                          <label
                            key={`${item.id}-${option}`}
                            className="flex items-center gap-2 text-sm text-gray-700"
                          >
                            <input
                              type="radio"
                              name={`arr-${item.id}`}
                              checked={item.resposta === option}
                              onChange={() =>
                                setRapidRiskChecklistAnswer(index, option)
                              }
                              className="h-4 w-4 text-blue-700"
                            />
                            <span>{option}</span>
                          </label>
                        ),
                      )}
                    </div>

                    {answerError && (
                      <p className="mt-2 text-xs text-red-500">
                        {String(answerError)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Observações e evidências
          {hasRapidRiskBasicNo && <span className="text-red-500"> *</span>}
        </label>
        <textarea
          value={rapidRiskObservacoes || ''}
          onChange={(event) =>
            setValue(
              'analise_risco_rapida_observacoes',
              event.target.value,
              { shouldValidate: true },
            )
          }
          rows={4}
          placeholder="Descreva ações adicionais, medidas corretivas e evidências adotadas."
          className={cn(
            'block w-full rounded-lg border px-3 py-2 text-sm transition-all focus:ring-2 focus:ring-blue-500/20 focus:outline-none',
            (errors.analise_risco_rapida_observacoes as any)
              ? 'border-red-500 bg-red-50'
              : 'border-gray-300 focus:border-blue-500',
          )}
        />
        {(errors.analise_risco_rapida_observacoes as any) && (
          <p className="mt-1 text-xs text-red-500">
            {(errors.analise_risco_rapida_observacoes as any).message}
          </p>
        )}
      </div>
    </div>
  );
};