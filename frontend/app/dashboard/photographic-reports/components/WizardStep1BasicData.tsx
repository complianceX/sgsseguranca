'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { ChipSelector } from './ChipSelector';
import { SHIFT_OPTIONS, TONE_OPTIONS, AREA_STATUS_OPTIONS } from '../constants';
import type {
  PhotographicReportShift,
  PhotographicReportTone,
  PhotographicReportAreaStatus,
} from '@/services/photographicReportsService';
import type { ReportFormState } from '../types';

interface WizardStep1Props {
  form: ReportFormState;
  onFormChange: <K extends keyof ReportFormState>(key: K, value: ReportFormState[K]) => void;
  canManage: boolean;
  mode: 'create' | 'edit';
  onNext: () => void;
  saving: boolean;
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'date' | 'time';
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  disabled,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  rows?: number;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={rows}
        className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      />
    </div>
  );
}

export function WizardStep1BasicData({
  form,
  onFormChange,
  canManage,
  mode,
  onNext,
  saving,
}: WizardStep1Props) {
  const { user } = useAuth();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Auto-fill in create mode only — on first mount
  useEffect(() => {
    if (mode !== 'create') return;
    if (!form.responsible_name && user?.nome) {
      onFormChange('responsible_name', user.nome);
    }
    if (!form.contractor_company && user?.company?.razao_social) {
      onFormChange('contractor_company', user.company.razao_social);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canProceed =
    form.client_name.trim() &&
    form.project_name.trim() &&
    form.activity_type.trim() &&
    form.start_date.trim() &&
    form.responsible_name.trim() &&
    form.contractor_company.trim();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Dados do relatório</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Informações básicas sobre a inspeção ou atividade realizada.
        </p>
      </div>

      {/* Essential fields grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Cliente"
          value={form.client_name}
          onChange={(v) => onFormChange('client_name', v)}
          required
          disabled={!canManage}
          placeholder="Nome do cliente"
        />
        <Field
          label="Obra / projeto"
          value={form.project_name}
          onChange={(v) => onFormChange('project_name', v)}
          required
          disabled={!canManage}
          placeholder="Nome da obra ou projeto"
        />
        <Field
          label="Tipo de atividade"
          value={form.activity_type}
          onChange={(v) => onFormChange('activity_type', v)}
          required
          disabled={!canManage}
          placeholder="Ex: Inspeção de segurança"
        />
        <Field
          label="Data da inspeção"
          value={form.start_date}
          onChange={(v) => onFormChange('start_date', v)}
          type="date"
          required
          disabled={!canManage}
        />
        <Field
          label="Responsável pelo relatório"
          value={form.responsible_name}
          onChange={(v) => onFormChange('responsible_name', v)}
          required
          disabled={!canManage}
          placeholder="Nome do responsável"
        />
        <Field
          label="Empresa executora"
          value={form.contractor_company}
          onChange={(v) => onFormChange('contractor_company', v)}
          required
          disabled={!canManage}
          placeholder="Razão social da empresa"
        />
      </div>

      {/* Chip selectors */}
      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-3">
        <ChipSelector
          label="Turno"
          options={SHIFT_OPTIONS}
          value={form.shift}
          onChange={(v) => onFormChange('shift', v as PhotographicReportShift)}
          disabled={!canManage}
        />
        <ChipSelector
          label="Tom do relatório"
          options={TONE_OPTIONS}
          value={form.report_tone}
          onChange={(v) => onFormChange('report_tone', v as PhotographicReportTone)}
          disabled={!canManage}
        />
        <ChipSelector
          label="Condição da área"
          options={AREA_STATUS_OPTIONS}
          value={form.area_status}
          onChange={(v) => onFormChange('area_status', v as PhotographicReportAreaStatus)}
          disabled={!canManage}
        />
      </div>

      {/* Advanced section */}
      <div>
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
          />
          Detalhes avançados
        </button>

        {advancedOpen && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 rounded-lg border border-dashed border-border p-4 bg-muted/30">
            <Field
              label="Unidade / seção"
              value={form.unit_name}
              onChange={(v) => onFormChange('unit_name', v)}
              disabled={!canManage}
              placeholder="Ex: Setor de manutenção"
            />
            <Field
              label="Localização"
              value={form.location}
              onChange={(v) => onFormChange('location', v)}
              disabled={!canManage}
              placeholder="Ex: Galpão B, piso 2"
            />
            <Field
              label="Código do cliente"
              value={form.client_id}
              onChange={(v) => onFormChange('client_id', v)}
              disabled={!canManage}
            />
            <Field
              label="Código da obra"
              value={form.project_id}
              onChange={(v) => onFormChange('project_id', v)}
              disabled={!canManage}
            />
            <Field
              label="Data final"
              value={form.end_date}
              onChange={(v) => onFormChange('end_date', v)}
              type="date"
              disabled={!canManage}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Horário início"
                value={form.start_time}
                onChange={(v) => onFormChange('start_time', v)}
                type="time"
                disabled={!canManage}
              />
              <Field
                label="Horário término"
                value={form.end_time}
                onChange={(v) => onFormChange('end_time', v)}
                type="time"
                disabled={!canManage}
              />
            </div>
            <div className="sm:col-span-2">
              <TextArea
                label="Observações gerais"
                value={form.general_observations}
                onChange={(v) => onFormChange('general_observations', v)}
                disabled={!canManage}
              />
            </div>
          </div>
        )}
      </div>

      {/* Action */}
      <div className="flex justify-end pt-2">
        <Button
          type="button"
          onClick={onNext}
          loading={saving}
          disabled={!canManage || !canProceed}
        >
          Próximo → Fotos
        </Button>
      </div>
    </div>
  );
}
