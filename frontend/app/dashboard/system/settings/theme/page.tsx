'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Eye, Loader2, Palette, RotateCcw, Save, Wand2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  stripThemeMetadata,
  systemThemeService,
  DEFAULT_THEME,
  type SystemThemePreset,
  type SystemThemePresetId,
  type SystemThemeTokens,
  type UpdateSystemThemeDto,
} from '@/services/systemThemeService';
import {
  applyTheme,
  applyStoredTheme,
  clearThemeOverrides,
  syncThemeRuntime,
} from '@/lib/theme-engine';

type ThemeField = keyof Omit<SystemThemeTokens, 'id' | 'updatedAt'>;

const FIELD_LABELS: Record<ThemeField, string> = {
  backgroundColor: 'Fundo principal',
  sidebarColor: 'Sidebar',
  cardColor: 'Cards / Superfícies',
  primaryColor: 'Cor primária (ações)',
  secondaryColor: 'Cor secundária',
  textPrimary: 'Texto primário',
  textSecondary: 'Texto secundário',
  successColor: 'Sucesso',
  warningColor: 'Alerta',
  dangerColor: 'Perigo / Erro',
  infoColor: 'Informação',
};

const FIELD_GROUPS: { label: string; fields: ThemeField[] }[] = [
  {
    label: 'Estrutura',
    fields: ['backgroundColor', 'sidebarColor', 'cardColor'],
  },
  {
    label: 'Identidade',
    fields: ['primaryColor', 'secondaryColor'],
  },
  {
    label: 'Tipografia',
    fields: ['textPrimary', 'textSecondary'],
  },
  {
    label: 'Status',
    fields: ['successColor', 'warningColor', 'dangerColor', 'infoColor'],
  },
];

function themesMatch(
  left: Omit<SystemThemeTokens, 'id' | 'updatedAt'>,
  right: Omit<SystemThemeTokens, 'id' | 'updatedAt'>,
): boolean {
  return (Object.keys(left) as ThemeField[]).every((key) => left[key] === right[key]);
}

export default function ThemeSettingsPage() {
  const router = useRouter();
  const { isAdminGeral, loading: authLoading } = useAuth();

  const [tokens, setTokens] = useState<Omit<SystemThemeTokens, 'id' | 'updatedAt'>>(DEFAULT_THEME);
  const [presets, setPresets] = useState<SystemThemePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [applyingPresetId, setApplyingPresetId] = useState<SystemThemePresetId | null>(null);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!isAdminGeral) {
      router.replace('/dashboard');
      return;
    }

    let active = true;

    Promise.all([systemThemeService.getTheme(), systemThemeService.getPresets()])
      .then(([theme, loadedPresets]) => {
        if (!active) return;
        setTokens(stripThemeMetadata(theme));
        setPresets(loadedPresets);
      })
      .catch(() => {
        if (!active) return;
        toast.error('Nao foi possivel carregar a configuracao de tema.');
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [authLoading, isAdminGeral, router]);

  const handleChange = useCallback((field: ThemeField, value: string) => {
    setTokens((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handlePreview = useCallback(() => {
    applyTheme(tokens);
    setPreviewing(true);
    toast.info('Preview aplicado. Salve para persistir.');
  }, [tokens]);

  const handleCancelPreview = useCallback(() => {
    clearThemeOverrides();
    setPreviewing(false);

    const restored = applyStoredTheme();
    if (restored) {
      setTokens(restored);
      return;
    }

    systemThemeService.getTheme().then((theme) => {
      const restoredTokens = stripThemeMetadata(theme);
      setTokens(restoredTokens);
      syncThemeRuntime(restoredTokens);
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const updated = await systemThemeService.updateTheme(tokens as UpdateSystemThemeDto);
      const fields = stripThemeMetadata(updated);
      setTokens(fields);
      syncThemeRuntime(fields);
      setPreviewing(false);
      toast.success('Tema salvo com sucesso!');
    } catch {
      toast.error('Erro ao salvar o tema.');
    } finally {
      setSaving(false);
    }
  }, [tokens]);

  const handleApplyPreset = useCallback(async (presetId: SystemThemePresetId) => {
    setApplyingPresetId(presetId);
    try {
      const updated = await systemThemeService.applyPreset(presetId);
      const fields = stripThemeMetadata(updated);
      setTokens(fields);
      syncThemeRuntime(fields);
      setPreviewing(false);
      toast.success('Preset aplicado em tempo real no sistema.');
    } catch {
      toast.error('Erro ao aplicar o preset.');
    } finally {
      setApplyingPresetId(null);
    }
  }, []);

  const handleReset = useCallback(async () => {
    if (!confirm('Restaurar o tema padrão? Esta ação não pode ser desfeita.')) return;
    setResetting(true);
    try {
      const updated = await systemThemeService.resetTheme();
      const fields = stripThemeMetadata(updated);
      setTokens(fields);
      syncThemeRuntime(fields);
      setPreviewing(false);
      toast.success('Tema restaurado para o padrão.');
    } catch {
      toast.error('Erro ao restaurar o tema.');
    } finally {
      setResetting(false);
    }
  }, []);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[color:var(--ds-color-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--ds-color-primary-subtle)] text-[color:var(--ds-color-action-primary)]">
            <Palette className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[color:var(--ds-color-text-primary)]">
              Tema do Sistema
            </h1>
            <p className="text-sm text-[color:var(--ds-color-text-muted)]">
              Ajuste a identidade visual e propague as cores em tempo real, sem recompilar o
              frontend.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {previewing ? (
            <button
              type="button"
              onClick={handleCancelPreview}
              className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--ds-color-border-default)] bg-transparent px-4 py-2 text-sm font-medium text-[color:var(--ds-color-text-secondary)] transition hover:bg-[color:var(--ds-color-surface-muted)]"
            >
              Cancelar preview
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePreview}
              className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--ds-color-border-default)] bg-transparent px-4 py-2 text-sm font-medium text-[color:var(--ds-color-text-secondary)] transition hover:bg-[color:var(--ds-color-surface-muted)]"
            >
              <Eye className="h-4 w-4" />
              Preview
            </button>
          )}

          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--ds-color-border-default)] bg-transparent px-4 py-2 text-sm font-medium text-[color:var(--ds-color-text-secondary)] transition hover:bg-[color:var(--ds-color-surface-muted)] disabled:opacity-50"
          >
            {resetting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Restaurar padrão
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--ds-color-action-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar tema
          </button>
        </div>
      </div>

      {previewing && (
        <div className="rounded-xl border border-[color:var(--ds-color-warning-border)] bg-[color:var(--ds-color-warning-subtle)]/20 px-4 py-3 text-sm text-[color:var(--ds-color-warning-fg)]">
          Preview ativo. Clique em <strong>Salvar tema</strong> para persistir ou em{' '}
          <strong>Cancelar preview</strong> para desfazer.
        </div>
      )}

      <section className="rounded-2xl border border-[color:var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-base)] p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[color:var(--ds-color-text-muted)]">
              Presets estrategicos
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-[color:var(--ds-color-text-secondary)]">
              Presets prontos para escritorio, dark mode, operacao industrial e alto contraste em
              campo. Ao aplicar, o sistema inteiro atualiza em tempo real.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {presets.map((preset) => {
            const active = themesMatch(tokens, preset.tokens);
            const applying = applyingPresetId === preset.id;

            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => void handleApplyPreset(preset.id)}
                disabled={applying}
                className="rounded-2xl border border-[color:var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-muted)] p-4 text-left transition hover:border-[color:var(--ds-color-action-primary)] hover:shadow-[var(--ds-shadow-md)] disabled:opacity-60"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[color:var(--ds-color-primary-subtle)] text-[color:var(--ds-color-action-primary)]">
                      {applying ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[color:var(--ds-color-text-primary)]">
                        {preset.label}
                      </div>
                      <div className="text-xs text-[color:var(--ds-color-text-muted)]">
                        {active ? 'Ativo agora' : 'Clique para aplicar'}
                      </div>
                    </div>
                  </div>
                  {active && (
                    <span className="rounded-full bg-[color:var(--ds-color-success-subtle)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--ds-color-success-fg)]">
                      Ativo
                    </span>
                  )}
                </div>

                <p className="mt-4 min-h-[60px] text-sm leading-6 text-[color:var(--ds-color-text-secondary)]">
                  {preset.description}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {(Object.values(preset.tokens) as string[]).slice(0, 6).map((color) => (
                    <span
                      key={`${preset.id}-${color}`}
                      className="h-8 w-8 rounded-xl border border-black/5 shadow-sm"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        {FIELD_GROUPS.map((group) => (
          <div
            key={group.label}
            className="rounded-2xl border border-[color:var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-base)] p-5"
          >
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-[color:var(--ds-color-text-muted)]">
              {group.label}
            </h2>
            <div className="space-y-4">
              {group.fields.map((field) => (
                <ColorRow
                  key={field}
                  label={FIELD_LABELS[field]}
                  value={tokens[field]}
                  onChange={(value) => handleChange(field, value)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-[color:var(--ds-color-border-subtle)] bg-[color:var(--ds-color-surface-base)] p-5">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-[color:var(--ds-color-text-muted)]">
          Paleta de cores
        </h2>
        <div className="flex flex-wrap gap-3">
          {(Object.entries(tokens) as [ThemeField, string][]).map(([field, color]) => (
            <div key={field} className="flex flex-col items-center gap-1.5">
              <div
                className="h-10 w-10 rounded-xl border border-white/10 shadow"
                style={{ backgroundColor: color }}
                title={FIELD_LABELS[field]}
              />
              <span className="text-[10px] text-[color:var(--ds-color-text-muted)]">
                {color}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-sm text-[color:var(--ds-color-text-secondary)]">{label}</label>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-[color:var(--ds-color-text-muted)]">{value}</span>
        <div className="relative h-8 w-8 overflow-hidden rounded-lg border border-[color:var(--ds-color-border-default)] shadow-sm">
          <div className="h-full w-full" style={{ backgroundColor: value }} />
          <input
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={label}
          />
        </div>
      </div>
    </div>
  );
}
