"use client";

import { Camera, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { ServicoItem } from "@/services/rdosService";

type PendingActivityPhotoPreview = {
  previewUrl: string;
  name: string;
};

interface RdoActivityEditorCardProps {
  activityIndex: number;
  item: ServicoItem;
  pendingPhotos: PendingActivityPhotoPreview[];
  totalPhotoCount: number;
  formInputClassName: string;
  onRemoveActivity: () => void;
  onUpdateDescription: (value: string) => void;
  onUpdatePercentual: (value: number) => void;
  onUpdateObservacao: (value: string) => void;
  onAddPhotos: (files: FileList | null) => void;
  onRemoveGovernedPhoto: (photoIndex: number, photo: string) => void;
  onRemovePendingPhoto: (photoIndex: number, previewUrl: string) => void;
  resolveActivityPhotoSrc: (photo: string) => string;
}

export function RdoActivityEditorCard({
  activityIndex,
  item,
  pendingPhotos,
  totalPhotoCount,
  formInputClassName,
  onRemoveActivity,
  onUpdateDescription,
  onUpdatePercentual,
  onUpdateObservacao,
  onAddPhotos,
  onRemoveGovernedPhoto,
  onRemovePendingPhoto,
  resolveActivityPhotoSrc,
}: RdoActivityEditorCardProps) {
  const inputId = `rdo-activity-photo-${activityIndex}`;

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ds-color-text-primary)]">
            Atividade #{activityIndex + 1}
          </p>
          <p className="text-sm text-[var(--ds-color-text-secondary)]">
            Registre o avanço, observações e evidências fotográficas da frente
            de serviço.
          </p>
        </div>
        <button
          type="button"
          title="Remover atividade"
          onClick={onRemoveActivity}
          className="rounded-lg p-2 text-[var(--ds-color-danger)] transition-colors hover:bg-[color:var(--ds-color-danger)]/10"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-secondary)]">
            Descrição da atividade
          </label>
          <input
            type="text"
            value={item.descricao}
            onChange={(event) => onUpdateDescription(event.target.value)}
            className={formInputClassName}
            placeholder="Ex: Concretagem de laje"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-secondary)]">
            % Concluído
          </label>
          <input
            type="number"
            aria-label="Percentual concluído"
            value={item.percentual_concluido}
            min={0}
            max={100}
            onChange={(event) =>
              onUpdatePercentual(Number(event.target.value))
            }
            className={formInputClassName}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--ds-color-text-secondary)]">
          Observação operacional
        </label>
        <textarea
          value={item.observacao ?? ""}
          onChange={(event) => onUpdateObservacao(event.target.value)}
          className={formInputClassName}
          rows={3}
          placeholder="Ex: Frente liberada às 09:30, concretagem executada com apoio de bomba e inspeção de fôrmas concluída."
        />
      </div>

      <div className="rounded-xl border border-dashed border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]/80 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-secondary)]">
              Evidências fotográficas
            </p>
            <p className="text-sm text-[var(--ds-color-text-secondary)]">
              Até 10 fotos por atividade. O upload é governado e gera URL
              assinada.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              id={inputId}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              multiple
              className="hidden"
              onChange={(event) => {
                onAddPhotos(event.target.files);
                event.target.value = "";
              }}
            />
            <label
              htmlFor={inputId}
              className={cn(
                buttonVariants({
                  variant: "outline",
                  size: "sm",
                }),
                "cursor-pointer",
              )}
            >
              <Camera className="mr-2 h-4 w-4" />
              Adicionar fotos
            </label>
            <span className="rounded-full bg-[color:var(--ds-color-action-primary)]/10 px-2.5 py-1 text-xs font-semibold text-[var(--ds-color-action-primary)]">
              {totalPhotoCount}/10
            </span>
          </div>
        </div>

        {(item.fotos?.length ?? 0) > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-secondary)]">
              Fotos já governadas
            </p>
            <div className="flex flex-wrap gap-2">
              {(item.fotos ?? []).map((photo, photoIndex) => (
                <div
                  key={`${photo}-${photoIndex}`}
                  className="relative h-20 w-20 overflow-hidden rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      resolveActivityPhotoSrc(photo) || "/placeholder-image.png"
                    }
                    alt={`Foto governada ${photoIndex + 1} da atividade ${activityIndex + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveGovernedPhoto(photoIndex, photo)}
                    className="absolute right-1 top-1 rounded-full bg-black/70 px-1 text-[10px] font-semibold text-white"
                    aria-label={`Remover foto governada ${photoIndex + 1}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {pendingPhotos.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-secondary)]">
              Fotos pendentes de envio
            </p>
            <div className="flex flex-wrap gap-2">
              {pendingPhotos.map((photo, photoIndex) => (
                <div
                  key={`${photo.previewUrl}-${photoIndex}`}
                  className="relative h-20 w-20 overflow-hidden rounded-xl border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.previewUrl}
                    alt={`Foto pendente ${photoIndex + 1} da atividade ${activityIndex + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onRemovePendingPhoto(photoIndex, photo.previewUrl)
                    }
                    className="absolute right-1 top-1 rounded-full bg-black/70 px-1 text-[10px] font-semibold text-white"
                    aria-label={`Remover foto pendente ${photoIndex + 1}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
