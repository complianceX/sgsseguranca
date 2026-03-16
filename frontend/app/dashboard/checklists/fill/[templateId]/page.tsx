'use client';

import { useCallback, useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { checklistsService, Checklist, ChecklistItem } from '@/services/checklistsService';
import { sitesService, Site } from '@/services/sitesService';
import { usersService, User } from '@/services/usersService';
import { signaturesService } from '@/services/signaturesService';
import { generateChecklistPdf } from '@/lib/pdf/checklistGenerator';
import { ArrowLeft, Save, Printer, Mail, CheckCircle2, ClipboardCheck, Lock } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { SendMailModal } from '@/components/SendMailModal';
import { SignatureModal } from '../../components/SignatureModal';
import { cn } from '@/lib/utils';

const panelClassName =
  'rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-sm)]';
const fieldClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-4 py-2 text-sm text-[var(--ds-color-text-primary)] transition-all focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';
const labelClassName = 'mb-2 block text-sm font-medium text-[var(--ds-color-text-secondary)]';

/** Renders styled Sim/Não/N/A or Conforme/NC/NA buttons for each item */
function ItemStatusButtons({
  item,
  index,
  onChange,
}: {
  item: ChecklistItem;
  index: number;
  onChange: (index: number, value: string) => void;
}) {
  const current = String(item.status);

  const choiceBtn = (value: string, label: string, activeClass: string) => (
    <button
      key={value}
      type="button"
      onClick={() => onChange(index, value)}
      className={cn(
        'flex cursor-pointer items-center justify-center rounded-[var(--ds-radius-sm)] border px-4 py-1.5 text-sm font-semibold transition-all',
        current === value
          ? activeClass
          : 'border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-secondary)] hover:bg-[var(--ds-color-surface-muted)]/40',
      )}
    >
      {label}
    </button>
  );

  if (item.tipo_resposta === 'sim_nao') {
    return (
      <div className="flex gap-2">
        {choiceBtn('sim', 'Sim', 'border-transparent bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)] ring-2 ring-[color:var(--ds-color-success)]/35')}
        {choiceBtn('nao', 'Não', 'border-transparent bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)] ring-2 ring-[color:var(--ds-color-danger)]/35')}
      </div>
    );
  }

  if (item.tipo_resposta === 'conforme') {
    return (
      <div className="flex gap-2">
        {choiceBtn('ok', 'Conforme', 'border-transparent bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)] ring-2 ring-[color:var(--ds-color-success)]/35')}
        {choiceBtn('nok', 'NC', 'border-transparent bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)] ring-2 ring-[color:var(--ds-color-danger)]/35')}
        {choiceBtn('na', 'N/A', 'border-transparent bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)] ring-2 ring-[var(--ds-color-border-default)]')}
      </div>
    );
  }

  if (item.tipo_resposta === 'texto') {
    return null; // observação field is enough
  }

  // default (sim_nao_na or unset): Sim / Não / N/A
  return (
    <div className="flex gap-2">
      {choiceBtn('sim', 'Sim', 'border-transparent bg-[var(--ds-color-success-subtle)] text-[var(--ds-color-success)] ring-2 ring-[color:var(--ds-color-success)]/35')}
      {choiceBtn('nao', 'Não', 'border-transparent bg-[var(--ds-color-danger-subtle)] text-[var(--ds-color-danger)] ring-2 ring-[color:var(--ds-color-danger)]/35')}
      {choiceBtn('na', 'N/A', 'border-transparent bg-[var(--ds-color-surface-muted)] text-[var(--ds-color-text-secondary)] ring-2 ring-[var(--ds-color-border-default)]')}
    </div>
  );
}

export default function FillChecklistPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = use(params);
  const router = useRouter();
  const { user } = useAuth();

  const [template, setTemplate] = useState<Checklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Form data
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [equipamento, setEquipamento] = useState('');
  const [maquina, setMaquina] = useState('');
  const [data, setData] = useState(new Date().toISOString().split('T')[0]);
  const [siteId, setSiteId] = useState('');
  const [inspetorId, setInspetorId] = useState(user?.id || '');
  const [itens, setItens] = useState<ChecklistItem[]>([]);
  const [fotoEquipamento, setFotoEquipamento] = useState('');

  // Post-save states
  const [savedChecklist, setSavedChecklist] = useState<Checklist | null>(null);
  const [signed, setSigned] = useState(false);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [pdfBase64, setPdfBase64] = useState<string>('');
  const [pdfFilename, setPdfFilename] = useState<string>('');
  const [printingOrSending, setPrintingOrSending] = useState(false);

  const loadTemplate = useCallback(async () => {
    try {
      setLoading(true);
      const data = await checklistsService.findOne(templateId);

      if (!data.is_modelo) {
        toast.error('Este checklist não é um template');
        router.push('/dashboard/checklists');
        return;
      }

      setTemplate(data);
      setTitulo(data.titulo);
      setDescricao(data.descricao || '');
      setEquipamento(data.equipamento || '');
      setMaquina(data.maquina || '');
      setItens(
        (data.itens || []).map((item) => ({
          ...item,
          status: item.tipo_resposta === 'conforme' ? 'ok' : 'sim',
          observacao: '',
        })),
      );
    } catch (error) {
      console.error('Erro ao carregar template:', error);
      toast.error('Erro ao carregar template');
      router.push('/dashboard/checklists');
    } finally {
      setLoading(false);
    }
  }, [router, templateId]);

  const loadSites = useCallback(async () => {
    try {
      const page = await sitesService.findPaginated({ page: 1, limit: 100 });
      setSites(page.data);
    } catch (error) {
      console.error('Erro ao carregar obras:', error);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const page = await usersService.findPaginated({ page: 1, limit: 100 });
      let nextUsers = page.data;

      if (user?.id && !nextUsers.some((u) => u.id === user.id)) {
        try {
          const currentUser = await usersService.findOne(user.id);
          nextUsers = [currentUser, ...nextUsers];
        } catch {}
      }

      setUsers(
        Array.from(new Map(nextUsers.map((u) => [u.id, u])).values()),
      );
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadTemplate();
    void loadSites();
    void loadUsers();
  }, [loadSites, loadTemplate, loadUsers]);

  useEffect(() => {
    if (user?.id && !inspetorId) setInspetorId(user.id);
  }, [user?.id, inspetorId]);

  const handleItemStatusChange = (index: number, value: string) => {
    setItens((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], status: value as ChecklistItem['status'] };
      return next;
    });
  };

  const handleItemObsChange = (index: number, value: string) => {
    setItens((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], observacao: value };
      return next;
    });
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setFotoEquipamento(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!titulo.trim()) { toast.error('Título é obrigatório'); return; }
    if (!siteId) { toast.error('Obra/Setor é obrigatório'); return; }
    if (!inspetorId) { toast.error('Inspetor é obrigatório'); return; }

    try {
      setSaving(true);

      const checklistData: Partial<Checklist> = {
        titulo,
        descricao,
        equipamento,
        maquina,
        foto_equipamento: fotoEquipamento,
        data,
        site_id: siteId,
        inspetor_id: inspetorId,
        itens,
        status: 'Pendente',
      };

      const created = await checklistsService.fillFromTemplate(templateId, checklistData);
      setSavedChecklist(created);
      toast.success('Checklist salvo com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar checklist:', error);
      toast.error('Erro ao salvar checklist');
    } finally {
      setSaving(false);
    }
  };

  const buildPdf = async (): Promise<{ base64: string; filename: string } | null> => {
    if (!savedChecklist) return null;
    try {
      const signatures = await signaturesService.findByChecklist(savedChecklist.id).catch(() => []);
      const result = await generateChecklistPdf(savedChecklist, signatures, { output: 'base64' });
      if (result && typeof result === 'object' && 'base64' in result) {
        return result as { base64: string; filename: string };
      }
      return null;
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      return null;
    }
  };

  const handlePrint = async () => {
    if (!savedChecklist) return;
    // Open window synchronously (before any await) to bypass popup blocker
    const win = window.open('', '_blank');
    setPrintingOrSending(true);
    try {
      const pdf = await buildPdf();
      if (!pdf) {
        win?.close();
        toast.error('Erro ao gerar PDF');
        return;
      }
      const byteString = atob(pdf.base64);
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      if (win) {
        win.location.href = url;
        // Give the PDF time to load before triggering print
        setTimeout(() => { try { win.print(); } catch { /* ignore */ } }, 1200);
      } else {
        // Fallback: download directly
        const a = document.createElement('a');
        a.href = url;
        a.download = pdf.filename;
        a.click();
      }
    } catch {
      win?.close();
      toast.error('Erro ao abrir impressão');
    } finally {
      setPrintingOrSending(false);
    }
  };

  const handleSendEmail = async () => {
    if (!savedChecklist) return;
    setPrintingOrSending(true);
    try {
      const pdf = await buildPdf();
      if (!pdf) { toast.error('Erro ao gerar PDF'); return; }
      setPdfBase64(pdf.base64);
      setPdfFilename(pdf.filename);
      setIsMailModalOpen(true);
    } catch {
      toast.error('Erro ao preparar envio de e-mail');
    } finally {
      setPrintingOrSending(false);
    }
  };

  const handleSign = async (signatureData: string, type: string) => {
    if (!savedChecklist) return;
    try {
      await signaturesService.create({
        document_id: savedChecklist.id,
        document_type: 'CHECKLIST',
        signature_data: signatureData,
        type,
        user_id: user?.id || '',
      });
      toast.success('Assinatura registrada!');
      setIsSignatureModalOpen(false);

      // Auto-save PDF to R2 after signing and lock the checklist
      try {
        toast.info('Salvando PDF no storage...');
        await checklistsService.savePdf(savedChecklist.id);
        toast.success('PDF salvo e checklist finalizado!');
      } catch {
        toast.warning('Assinatura registrada, mas PDF não pôde ser salvo automaticamente.');
      }
      setSigned(true);
    } catch (error) {
      console.error('Erro ao assinar:', error);
      toast.error('Erro ao registrar assinatura');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[var(--ds-color-action-primary)] border-t-transparent" />
          <p className="text-[var(--ds-color-text-secondary)]">Carregando template...</p>
        </div>
      </div>
    );
  }

  if (!template) return null;

  // ── POST-SAVE STATE ──────────────────────────────────────────────────────────
  if (savedChecklist) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-10">
        <div className={`${panelClassName} p-8 text-center`}>
          {/* Icon: lock after signing, checkmark otherwise */}
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--ds-color-success)]/15">
            {signed
              ? <Lock className="h-7 w-7 text-[var(--ds-color-success)]" />
              : <CheckCircle2 className="h-7 w-7 text-[var(--ds-color-success)]" />}
          </div>

          <h2 className="mb-1 text-xl font-bold text-[var(--ds-color-text-primary)]">
            {signed ? 'Checklist finalizado e assinado' : 'Checklist salvo!'}
          </h2>
          <p className="mb-6 text-sm text-[var(--ds-color-text-muted)]">
            {signed
              ? 'O documento foi assinado e o PDF salvo. Não pode mais ser editado.'
              : 'Imprima, assine ou envie por e-mail.'}
          </p>

          {/* Primary: Imprimir */}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => void handlePrint()}
              disabled={printingOrSending}
              className="flex items-center justify-center gap-2 rounded-[var(--ds-radius-md)] bg-[var(--ds-color-action-primary)] px-6 py-3 text-sm font-semibold text-[var(--ds-color-action-primary-foreground)] transition-colors hover:bg-[var(--ds-color-action-primary-hover)] disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              {printingOrSending ? 'Gerando PDF...' : 'Imprimir PDF'}
            </button>

            {!signed && (
              <button
                type="button"
                onClick={() => setIsSignatureModalOpen(true)}
                className="flex items-center justify-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-5 py-3 text-sm font-semibold text-[var(--ds-color-text-primary)] transition-colors hover:bg-[var(--ds-color-surface-muted)]/40"
              >
                <ClipboardCheck className="h-4 w-4" />
                Assinar
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleSendEmail()}
              disabled={printingOrSending}
              className="flex items-center justify-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-5 py-3 text-sm font-semibold text-[var(--ds-color-text-primary)] transition-colors hover:bg-[var(--ds-color-surface-muted)]/40 disabled:opacity-50"
            >
              <Mail className="h-4 w-4" />
              Enviar por E-mail
            </button>
          </div>

          <div className="mt-6 border-t border-[var(--ds-color-border-subtle)] pt-4">
            <Link
              href="/dashboard/checklists"
              className="text-sm text-[var(--ds-color-text-muted)] hover:text-[var(--ds-color-text-secondary)]"
            >
              ← Voltar para checklists
            </Link>
          </div>
        </div>

        <SignatureModal
          isOpen={isSignatureModalOpen}
          onClose={() => setIsSignatureModalOpen(false)}
          onSave={(signatureData, type) => { void handleSign(signatureData, type); }}
          userName={users.find((u) => u.id === inspetorId)?.nome || user?.nome || 'Inspetor'}
        />

        {isMailModalOpen && pdfBase64 && (
          <SendMailModal
            isOpen={isMailModalOpen}
            onClose={() => setIsMailModalOpen(false)}
            documentName={titulo}
            filename={pdfFilename}
            base64={pdfBase64}
          />
        )}
      </div>
    );
  }

  // ── FILL FORM ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/checklists"
          className="flex items-center text-[var(--ds-color-text-secondary)] transition-colors hover:text-[var(--ds-color-text-primary)]"
        >
          <ArrowLeft className="mr-2 h-5 w-5" />
          Voltar
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">Preencher Checklist</h1>
          <p className="text-sm text-[var(--ds-color-text-muted)]">Modelo: {template.titulo}</p>
        </div>
      </div>

      <div className={`${panelClassName} p-6 space-y-6`}>
        {/* Informações Básicas */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="checklist-titulo" className={labelClassName}>Título *</label>
            <input
              id="checklist-titulo"
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className={fieldClassName}
              required
            />
          </div>

          <div>
            <label htmlFor="checklist-data" className={labelClassName}>Data *</label>
            <input
              id="checklist-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className={fieldClassName}
              required
            />
          </div>

          <div>
            <label htmlFor="checklist-site" className={labelClassName}>Obra/Setor *</label>
            <select
              id="checklist-site"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className={fieldClassName}
              required
            >
              <option value="">Selecione...</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>{site.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="checklist-inspetor" className={labelClassName}>Inspetor *</label>
            <select
              id="checklist-inspetor"
              value={inspetorId}
              onChange={(e) => setInspetorId(e.target.value)}
              className={fieldClassName}
              required
            >
              <option value="">Selecione...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>

          {equipamento && (
            <div>
              <label htmlFor="checklist-equipamento" className={labelClassName}>Equipamento</label>
              <input
                id="checklist-equipamento"
                type="text"
                value={equipamento}
                onChange={(e) => setEquipamento(e.target.value)}
                className={fieldClassName}
              />
            </div>
          )}

          {maquina && (
            <div>
              <label htmlFor="checklist-maquina" className={labelClassName}>Máquina</label>
              <input
                id="checklist-maquina"
                type="text"
                value={maquina}
                onChange={(e) => setMaquina(e.target.value)}
                className={fieldClassName}
              />
            </div>
          )}
        </div>

        <div>
          <label htmlFor="checklist-descricao" className={labelClassName}>Descrição</label>
          <textarea
            id="checklist-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={2}
            className={fieldClassName}
          />
        </div>

        {/* Foto do Equipamento */}
        <div>
          <label htmlFor="checklist-foto" className={labelClassName}>Foto do Equipamento</label>
          <input
            id="checklist-foto"
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            className={fieldClassName}
          />
          {fotoEquipamento && (
            <Image
              src={fotoEquipamento}
              alt="Equipamento"
              width={320}
              height={240}
              className="mt-3 max-w-xs rounded-lg border"
              unoptimized
            />
          )}
        </div>

        {/* Itens do Checklist */}
        <div>
          <h3 className="mb-4 text-lg font-semibold text-[var(--ds-color-text-primary)]">
            Itens de Verificação
          </h3>
          <div className="space-y-3">
            {itens.map((item, index) => {
              const isNonConforming = item.status === 'nok' || item.status === 'nao';
              return (
                <div
                  key={index}
                  className={cn(
                    'rounded-[var(--ds-radius-lg)] border p-4 transition-colors',
                    isNonConforming
                      ? 'border-[var(--ds-color-danger-border)] bg-[color:var(--ds-color-danger)]/4'
                      : 'border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/22',
                  )}
                >
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-medium text-[var(--ds-color-text-primary)]">
                        {index + 1}. {item.item}
                        {item.obrigatorio && (
                          <span className="ml-1 text-[var(--ds-color-danger)]">*</span>
                        )}
                      </p>
                      {item.peso && item.peso > 1 && (
                        <span className="mt-1 inline-block rounded-[var(--ds-radius-sm)] bg-[var(--ds-color-warning-subtle)] px-2 py-0.5 text-xs font-semibold text-[var(--ds-color-warning)]">
                          Peso: {item.peso}
                        </span>
                      )}
                    </div>
                    <ItemStatusButtons
                      item={item}
                      index={index}
                      onChange={handleItemStatusChange}
                    />
                  </div>

                  {/* Observação — obrigatória se NC/Não */}
                  <input
                    type="text"
                    value={item.observacao || ''}
                    onChange={(e) => handleItemObsChange(index, e.target.value)}
                    placeholder={
                      isNonConforming
                        ? 'Observação obrigatória para não conformidade...'
                        : 'Observações...'
                    }
                    className={cn(
                      'w-full rounded-[var(--ds-radius-md)] border px-3 py-2 text-sm focus:outline-none',
                      isNonConforming && !item.observacao
                        ? 'border-[var(--ds-color-danger-border)] bg-[var(--ds-color-danger-subtle)] placeholder:text-[var(--ds-color-danger)] focus:border-[var(--ds-color-danger)] focus:ring-2 focus:ring-[color:var(--ds-color-danger)]/25'
                        : 'border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] focus:border-[var(--ds-color-focus)] focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]',
                    )}
                  />

                  {/* Textarea para tipo texto */}
                  {item.tipo_resposta === 'texto' && (
                    <textarea
                      value={String(item.resposta || '')}
                      onChange={(e) =>
                        setItens((prev) => {
                          const next = [...prev];
                          next[index] = { ...next[index], resposta: e.target.value };
                          return next;
                        })
                      }
                      rows={3}
                      placeholder="Resposta em texto livre..."
                      className="mt-2 w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-3 py-2 text-sm focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Ações */}
        <div className="flex gap-3 border-t border-[var(--ds-color-border-subtle)] pt-6">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-[var(--ds-radius-md)] bg-[var(--ds-color-action-primary)] px-6 py-3 font-semibold text-[var(--ds-color-action-primary-foreground)] transition-colors hover:bg-[var(--ds-color-action-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-5 w-5" />
            {saving ? 'Salvando...' : 'Salvar e Finalizar'}
          </button>
          <Link
            href="/dashboard/checklists"
            className="flex items-center justify-center gap-2 rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] px-5 py-3 text-sm font-semibold text-[var(--ds-color-text-secondary)] transition-colors hover:bg-[var(--ds-color-surface-muted)]/40"
          >
            Cancelar
          </Link>
        </div>
      </div>
    </div>
  );
}
