import React from "react";
import { Camera, Plus, Trash2 } from "lucide-react";
import {
  UseFormRegister,
  UseFormWatch,
  UseFormSetValue,
} from "react-hook-form";
import {
  ChecklistFormData,
  ChecklistItemForm,
  ChecklistSubitemForm,
} from "../types";
import {
  createChecklistSubitemId,
  toAlphabeticalLabel,
} from "../hierarchy";

interface ExecutionItemProps {
  item: ChecklistItemForm;
  index: number;
  register: UseFormRegister<ChecklistFormData>;
  watch: UseFormWatch<ChecklistFormData>;
  setValue?: UseFormSetValue<ChecklistFormData>;
  onUploadPhotos?: (index: number, files: File[]) => Promise<string[]>;
  resolvePhotoSrc?: (
    photo: string,
    itemIndex: number,
    photoIndex: number,
  ) => string;
  onRemove?: (index: number) => void;
}

export const ExecutionItem = React.memo(
  ({
    item,
    index,
    register,
    watch,
    setValue,
    onUploadPhotos,
    resolvePhotoSrc,
    onRemove,
  }: ExecutionItemProps) => {
    const statusValue = watch(`itens.${index}.status`);
    const observacaoValue = watch(`itens.${index}.observacao`);
    const photoValues = watch(`itens.${index}.fotos`) || [];
    const subitems = watch(`itens.${index}.subitens`) || [];
    const fileInputRef = React.useRef<HTMLInputElement | null>(null);
    const choiceBaseClassName =
      "flex cursor-pointer items-center gap-1 rounded-[var(--ds-radius-sm)] border px-3 py-1.5 text-sm font-semibold transition-colors";
    const fieldClassName =
      "w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] transition-all focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]";

    const addSubitem = () => {
      if (!setValue) return;
      const next: ChecklistSubitemForm[] = [
        ...subitems,
        { id: createChecklistSubitemId(), texto: "", ordem: subitems.length + 1 },
      ];
      setValue(`itens.${index}.subitens`, next, {
        shouldDirty: true,
        shouldTouch: true,
      });
    };

    const removeSubitem = (subitemIndex: number) => {
      if (!setValue) return;
      const next = subitems
        .filter((_, currentIndex) => currentIndex !== subitemIndex)
        .map((subitem, currentIndex) => ({
          ...subitem,
          ordem: currentIndex + 1,
        }));
      setValue(`itens.${index}.subitens`, next, {
        shouldDirty: true,
        shouldTouch: true,
      });
    };

    const handleAddPhotos = async (
      event: React.ChangeEvent<HTMLInputElement>,
    ) => {
      if (!setValue) {
        return;
      }

      const files = Array.from(event.target.files || []);
      if (!files.length) {
        return;
      }

      try {
        const encodedPhotos = onUploadPhotos
          ? await onUploadPhotos(index, files)
          : await Promise.all(
              files.map(
                (file) =>
                  new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result || ""));
                    reader.onerror = () =>
                      reject(new Error("Falha ao ler a imagem."));
                    reader.readAsDataURL(file);
                  }),
              ),
            );

        setValue(`itens.${index}.fotos`, [...photoValues, ...encodedPhotos], {
          shouldDirty: true,
          shouldTouch: true,
        });
      } finally {
        event.target.value = "";
      }
    };

    const handleRemovePhoto = (photoIndex: number) => {
      if (!setValue) {
        return;
      }

      setValue(
        `itens.${index}.fotos`,
        photoValues.filter((_, currentIndex) => currentIndex !== photoIndex),
        {
          shouldDirty: true,
          shouldTouch: true,
        },
      );
    };

    const choiceBtn = (value: string, label: string, activeClass: string) => (
      <label
        key={value}
        className={`${choiceBaseClassName} ${
          statusValue === value
            ? activeClass
            : "border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-secondary)] hover:bg-[var(--ds-color-surface-muted)]/40"
        }`}
      >
        <input
          type="radio"
          value={value}
          {...register(`itens.${index}.status`)}
          className="hidden"
        />
        {label}
      </label>
    );

    return (
      <div className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/22 p-4 transition-colors hover:border-[var(--ds-color-warning-border)]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                Item de verificação
              </label>
              <button
                type="button"
                onClick={() => onRemove?.(index)}
                className="rounded-[var(--ds-radius-sm)] p-1 text-[var(--ds-color-danger)] transition-colors hover:bg-[var(--ds-color-danger-subtle)]"
                title="Remover item"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <input
              {...register(`itens.${index}.item`)}
              className={fieldClassName}
              placeholder="Ex: A área possui condições adequadas?"
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--ds-color-text-muted)]">
                Tipo: {item.tipo_resposta?.replaceAll("_", "/") || "sim/nao/na"}
              </span>
              {item.peso > 1 && (
                <span className="inline-block rounded-[var(--ds-radius-sm)] bg-[var(--ds-color-warning-subtle)] px-2 py-0.5 text-xs font-semibold text-[var(--ds-color-warning)]">
                  Peso: {item.peso}
                </span>
              )}
              {item.obrigatorio && (
                <span className="inline-block rounded-[var(--ds-radius-sm)] bg-[var(--ds-color-danger-subtle)] px-2 py-0.5 text-xs font-semibold text-[var(--ds-color-danger)]">
                  Obrigatório
                </span>
              )}
            </div>
          </div>

          <div className="ml-2">
            {(item.tipo_resposta === "sim_nao_na" || !item.tipo_resposta) && (
              <div className="flex gap-2">
                {choiceBtn(
                  "sim",
                  "Sim",
                  "border-transparent bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)] ring-2 ring-[color:var(--ds-color-success)]/35",
                )}
                {choiceBtn(
                  "nao",
                  "Não",
                  "border-transparent bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)] ring-2 ring-[color:var(--ds-color-danger)]/35",
                )}
                {choiceBtn(
                  "na",
                  "N/A",
                  "border-transparent bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)] ring-2 ring-[var(--ds-color-border-default)]",
                )}
              </div>
            )}

            {item.tipo_resposta === "sim_nao" && (
              <div className="flex gap-2">
                {choiceBtn(
                  "sim",
                  "Sim",
                  "border-transparent bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)] ring-2 ring-[color:var(--ds-color-success)]/35",
                )}
                {choiceBtn(
                  "nao",
                  "Não",
                  "border-transparent bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)] ring-2 ring-[color:var(--ds-color-danger)]/35",
                )}
              </div>
            )}

            {item.tipo_resposta === "conforme" && (
              <div className="flex gap-2">
                {choiceBtn(
                  "ok",
                  "Conforme",
                  "border-transparent bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)] ring-2 ring-[color:var(--ds-color-success)]/35",
                )}
                {choiceBtn(
                  "nok",
                  "NC",
                  "border-transparent bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)] ring-2 ring-[color:var(--ds-color-danger)]/35",
                )}
                {choiceBtn(
                  "na",
                  "N/A",
                  "border-transparent bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)] ring-2 ring-[var(--ds-color-border-default)]",
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mb-3 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-secondary)]">
              Subitens / alternativas
            </p>
            <button
              type="button"
              onClick={addSubitem}
              className="inline-flex items-center gap-1 rounded-[var(--ds-radius-sm)] border border-[var(--ds-color-border-default)] px-2 py-1 text-xs font-medium text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar
            </button>
          </div>
          <div className="space-y-2">
            {subitems.map((_, subitemIndex) => (
              <div
                key={`subitem-${index}-${subitemIndex}`}
                className="grid grid-cols-[auto,1fr,auto] items-center gap-2"
              >
                <span className="text-xs font-semibold text-[var(--ds-color-text-muted)]">
                  {toAlphabeticalLabel(subitemIndex)}
                </span>
                <input
                  {...register(
                    `itens.${index}.subitens.${subitemIndex}.texto` as Parameters<
                      typeof register
                    >[0],
                  )}
                  className={fieldClassName}
                  placeholder="Ex: Ventilação adequada"
                />
                <button
                  type="button"
                  onClick={() => removeSubitem(subitemIndex)}
                  className="rounded-[var(--ds-radius-sm)] p-1 text-[var(--ds-color-danger)] transition-colors hover:bg-[var(--ds-color-danger-subtle)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {!subitems.length ? (
              <p className="text-xs text-[var(--ds-color-text-muted)]">
                Sem subitens cadastrados para este item.
              </p>
            ) : null}
          </div>
        </div>

        {item.tipo_resposta === "texto" && (
          <textarea
            {...register(
              `itens.${index}.resposta` as Parameters<typeof register>[0],
            )}
            rows={3}
            placeholder="Resposta em texto livre..."
            className="mb-2 w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]"
          />
        )}

        <div className="mt-2">
          <input
            {...register(`itens.${index}.observacao`)}
            placeholder={
              statusValue === "nok" || statusValue === "nao"
                ? "Observação obrigatória para Não Conformidade..."
                : "Observações..."
            }
            className={`w-full rounded-[var(--ds-radius-md)] border px-3 py-2 text-sm text-[var(--ds-color-text-primary)] focus:outline-none ${
              (statusValue === "nok" || statusValue === "nao") &&
              !observacaoValue
                ? "border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] placeholder:text-[var(--ds-color-danger)] focus:border-[var(--ds-color-danger)] focus:ring-2 focus:ring-[color:var(--ds-color-danger)]/25"
                : "border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] focus:border-[var(--ds-color-focus)] focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]"
            }`}
          />
        </div>

        <div className="mt-2 flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(event) => void handleAddPhotos(event)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 text-xs text-[var(--ds-color-action-primary)] transition-colors hover:text-[var(--ds-color-action-primary-hover)]"
          >
            <Camera className="h-3 w-3" />
            {photoValues.length
              ? `Adicionar Foto (${photoValues.length})`
              : "Adicionar Foto"}
          </button>
        </div>

        {photoValues.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {photoValues.map((photo, photoIndex) => (
              <div
                key={`${index}-${photoIndex}`}
                className="relative h-16 w-16 overflow-hidden rounded-[var(--ds-radius-sm)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    resolvePhotoSrc?.(photo, index, photoIndex) ||
                    "/placeholder-image.png"
                  }
                  alt={`Foto ${photoIndex + 1} do item ${index + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => handleRemovePhoto(photoIndex)}
                  className="absolute right-1 top-1 rounded-full bg-black/70 px-1 text-[10px] font-semibold text-white"
                  aria-label={`Remover foto ${photoIndex + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  },
);

ExecutionItem.displayName = "ExecutionItem";
