import React, { useEffect, useMemo, useState } from 'react';
import {
  PT_CONDICOES_AREA,
  type Pt,
  type PtCondicaoArea,
} from '@/services/ptsService';

type PtClosureModalProps = {
  pt: Pt | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    condicao_area: PtCondicaoArea;
    data_hora_real_fim?: string;
    observacoes?: string;
  }) => void;
};

const toLocalDateTimeInputValue = (date: Date): string => {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

export function PtClosureModal({
  pt,
  loading,
  onClose,
  onConfirm,
}: PtClosureModalProps) {
  const [condicaoArea, setCondicaoArea] = useState<PtCondicaoArea | ''>('');
  const [dataHoraRealFim, setDataHoraRealFim] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (pt) {
      setCondicaoArea('');
      setDataHoraRealFim(toLocalDateTimeInputValue(new Date()));
      setObservacoes('');
      setValidationError(null);
    }
  }, [pt]);

  const minDateTime = useMemo(
    () =>
      pt?.data_hora_inicio
        ? toLocalDateTimeInputValue(new Date(pt.data_hora_inicio))
        : undefined,
    [pt?.data_hora_inicio],
  );

  if (!pt) return null;

  const handleConfirm = () => {
    if (!condicaoArea) {
      setValidationError('Selecione a condição da área na devolução.');
      return;
    }
    if (
      dataHoraRealFim &&
      pt.data_hora_inicio &&
      new Date(dataHoraRealFim) < new Date(pt.data_hora_inicio)
    ) {
      setValidationError(
        'O término real não pode ser anterior ao início da PT.',
      );
      return;
    }
    setValidationError(null);
    onConfirm({
      condicao_area: condicaoArea,
      data_hora_real_fim: dataHoraRealFim
        ? new Date(dataHoraRealFim).toISOString()
        : undefined,
      observacoes: observacoes.trim() || undefined,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pt-closure-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-lg rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] p-6 shadow-[var(--ds-shadow-lg)]">
        <h2
          id="pt-closure-title"
          className="text-lg font-bold text-[var(--ds-color-text-primary)]"
        >
          Encerrar PT {pt.numero}
        </h2>
        <p className="mt-1 text-sm text-[var(--ds-color-text-secondary)]">
          Registre a devolução da área. Esses dados ficam gravados no documento
          e no PDF final.
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-[var(--ds-color-text-primary)]">
              Condição da área <span className="text-[var(--ds-color-danger)]">*</span>
            </label>
            <select
              value={condicaoArea}
              onChange={(event) =>
                setCondicaoArea(event.target.value as PtCondicaoArea | '')
              }
              className="block w-full rounded-lg border border-[var(--ds-color-border-default)] px-3 py-2 text-sm focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]"
            >
              <option value="">Selecione...</option>
              {PT_CONDICOES_AREA.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-[var(--ds-color-text-primary)]">
              Data/hora real de término
            </label>
            <input
              type="datetime-local"
              value={dataHoraRealFim}
              min={minDateTime}
              onChange={(event) => setDataHoraRealFim(event.target.value)}
              className="block w-full rounded-lg border border-[var(--ds-color-border-default)] px-3 py-2 text-sm focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-[var(--ds-color-text-primary)]">
              Observações de encerramento
            </label>
            <textarea
              value={observacoes}
              onChange={(event) => setObservacoes(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Ex: Área limpa, bloqueios removidos e sistema reenergizado."
              className="block w-full rounded-lg border border-[var(--ds-color-border-default)] px-3 py-2 text-sm focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]"
            />
          </div>

          {validationError && (
            <p className="text-sm text-[var(--ds-color-danger)]">
              {validationError}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-[var(--ds-color-border-default)] px-4 py-2 text-sm font-semibold text-[var(--ds-color-text-primary)] hover:bg-[color:var(--ds-color-surface-muted)]/40 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="rounded-lg bg-[var(--ds-color-action-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Encerrando...' : 'Encerrar PT'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PtClosureModal;
