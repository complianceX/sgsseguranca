import React from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  UseFormRegister,
  UseFormSetValue,
  UseFormWatch,
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

interface TemplateItemProps {
  item: ChecklistItemForm;
  index: number;
  register: UseFormRegister<ChecklistFormData>;
  watch: UseFormWatch<ChecklistFormData>;
  setValue: UseFormSetValue<ChecklistFormData>;
  remove: (index: number) => void;
}

const wrapperClassName =
  "rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] p-4";
const labelClassName =
  "mb-1 block text-xs font-medium text-[var(--ds-color-text-muted)]";
const fieldClassName =
  "w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm text-[var(--ds-color-text-primary)] transition-all focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]";

export const TemplateItem = React.memo(
  ({ index, register, watch, setValue, remove }: TemplateItemProps) => {
    const subitems = watch(`itens.${index}.subitens`) || [];

    const addSubitem = () => {
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

    return (
      <div className={wrapperClassName}>
        <div className="mb-4 grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-6">
            <label className={labelClassName}>Item de verificação</label>
            <input
              {...register(`itens.${index}.item`)}
              className={fieldClassName}
              placeholder="Ex: A área possui condições adequadas?"
            />
          </div>

          <div className="col-span-12 md:col-span-3">
            <label className={labelClassName}>Tipo de resposta</label>
            <select {...register(`itens.${index}.tipo_resposta`)} className={fieldClassName}>
              <option value="conforme">Conforme / NC / NA</option>
              <option value="sim_nao">Sim / Não</option>
              <option value="sim_nao_na">Sim / Não / N/A</option>
              <option value="texto">Texto livre</option>
              <option value="foto">Apenas foto</option>
            </select>
          </div>

          <div className="col-span-8 md:col-span-2">
            <label className={labelClassName}>Peso</label>
            <input
              type="number"
              min="1"
              max="5"
              {...register(`itens.${index}.peso`, { valueAsNumber: true })}
              className={fieldClassName}
            />
          </div>

          <div className="col-span-4 md:col-span-1 flex items-end justify-end">
            <button
              type="button"
              onClick={() => remove(index)}
              className="rounded-[var(--ds-radius-sm)] p-2 text-[var(--ds-color-danger)] transition-colors hover:bg-[var(--ds-color-danger-subtle)]"
              title="Remover item"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/18 p-3 md:grid-cols-4">
          <div>
            <label className={labelClassName}>Criticidade</label>
            <select
              {...register(`itens.${index}.criticidade`)}
              className={fieldClassName}
            >
              <option value="baixo">Baixo</option>
              <option value="medio">Médio</option>
              <option value="alto">Alto</option>
              <option value="critico">Crítico</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label className={labelClassName}>Ação corretiva imediata</label>
            <input
              {...register(`itens.${index}.acao_corretiva_imediata`)}
              className={fieldClassName}
              placeholder="Ex: interromper uso da área até correção"
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-[var(--ds-color-text-secondary)]">
            <input
              type="checkbox"
              {...register(`itens.${index}.bloqueia_operacao_quando_nc`)}
              className="h-4 w-4 rounded border-[var(--ds-color-border-default)]"
            />
            Bloqueia operação quando NC
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-[var(--ds-color-text-secondary)]">
            <input
              type="checkbox"
              {...register(`itens.${index}.exige_foto_quando_nc`)}
              className="h-4 w-4 rounded border-[var(--ds-color-border-default)]"
            />
            Exige foto quando NC
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-[var(--ds-color-text-secondary)]">
            <input
              type="checkbox"
              {...register(`itens.${index}.exige_observacao_quando_nc`)}
              className="h-4 w-4 rounded border-[var(--ds-color-border-default)]"
            />
            Exige observação quando NC
          </label>
        </div>

        <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/20 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-secondary)]">
              Subitens / alternativas (A, B, C...)
            </p>
            <button
              type="button"
              onClick={addSubitem}
              className="inline-flex items-center gap-1 rounded-[var(--ds-radius-sm)] border border-[var(--ds-color-border-default)] px-2 py-1 text-xs font-medium text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar subitem
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
                  placeholder="Ex: Cobertura adequada"
                />
                <button
                  type="button"
                  onClick={() => removeSubitem(subitemIndex)}
                  className="rounded-[var(--ds-radius-sm)] p-1 text-[var(--ds-color-danger)] transition-colors hover:bg-[var(--ds-color-danger-subtle)]"
                  title="Remover subitem"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {!subitems.length ? (
              <p className="text-xs text-[var(--ds-color-text-muted)]">
                Nenhum subitem cadastrado. Use para detalhar alternativas do item.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  },
);

TemplateItem.displayName = "TemplateItem";
