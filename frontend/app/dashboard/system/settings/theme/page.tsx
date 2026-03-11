'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Palette, RotateCcw, Save, Eye, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  systemThemeService,
  DEFAULT_THEME,
  type SystemThemeTokens,
  type UpdateSystemThemeDto,
} from '@/services/systemThemeService';
import { applyTheme, clearThemeOverrides } from '@/lib/theme-engine';

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

export default function ThemeSettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdminGeral = user?.profile?.nome === 'Administrador Geral';

  const [tokens, setTokens] = useState<Omit<SystemThemeTokens, 'id' | 'updatedAt'>>(DEFAULT_THEME);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (!isAdminGeral) {
      router.replace('/dashboard');
      return;
    }
    systemThemeService
      .getTheme()
      .then((t) => {
        const { id: _id, updatedAt: _u, ...fields } = t;
        setTokens(fields);
      })
      .finally(() => setLoading(false));
  }, [isAdminGeral, router]);

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
    systemThemeService.getTheme().then((t) => {
      const { id: _id, updatedAt: _u, ...fields } = t;
      applyTheme(fields);
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const updated = await systemThemeService.updateTheme(tokens as UpdateSystemThemeDto);
      const { id: _id, updatedAt: _u, ...fields } = updated;
      setTokens(fields);
      applyTheme(fields);
      setPreviewing(false);
      toast.success('Tema salvo com sucesso!');
    } catch {
      toast.error('Erro ao salvar o tema.');
    } finally {
      setSaving(false);
    }
  }, [tokens]);

  const handleReset = useCallback(async () => {
    if (!confirm('Restaurar o tema padrão? Esta ação não pode ser desfeita.')) return;
    setResetting(true);
    try {
      const updated = await systemThemeService.resetTheme();
      const { id: _id, updatedAt: _u, ...fields } = updated;
      setTokens(fields);
      applyTheme(fields);
      setPreviewing(false);
      toast.success('Tema restaurado para o padrão.');
    } catch {
      toast.error('Erro ao restaurar o tema.');
    } finally {
      setResetting(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[color:var(--ds-color-text-muted)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      {/* Header */}
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
              Personalize as cores de toda a plataforma
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
          Preview ativo — as cores estão sendo exibidas em tempo real. Clique em{' '}
          <strong>Salvar tema</strong> para persistir ou <strong>Cancelar preview</strong> para
          desfazer.
        </div>
      )}

      {/* Color groups */}
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
                  onChange={(v) => handleChange(field, v)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Live palette preview */}
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
  onChange: (v: string) => void;
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
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={label}
          />
        </div>
      </div>
    </div>
  );
}
