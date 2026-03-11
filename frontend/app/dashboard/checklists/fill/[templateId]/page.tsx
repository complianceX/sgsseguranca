'use client';

import { useCallback, useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { checklistsService, Checklist, ChecklistItem } from '@/services/checklistsService';
import { sitesService, Site } from '@/services/sitesService';
import { usersService, User } from '@/services/usersService';
import { signaturesService } from '@/services/signaturesService';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { SendMailModal } from '@/components/SendMailModal';
import { SignatureModal } from '../../components/SignatureModal';

const panelClassName =
  'rounded-[var(--ds-radius-xl)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] shadow-[var(--ds-shadow-sm)]';
const fieldClassName =
  'w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-base)] px-4 py-2 text-sm text-[var(--ds-color-text-primary)] transition-all focus:border-[var(--ds-color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--ds-color-focus-ring)]';
const labelClassName = 'mb-2 block text-sm font-medium text-[var(--ds-color-text-secondary)]';

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
  
  // Estados para assinatura e envio
  const [checklistId, setChecklistId] = useState<string | null>(null);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [isMailModalOpen, setIsMailModalOpen] = useState(false);
  const [pdfData, setPdfData] = useState<{ base64: string; filename: string } | null>(null);

  const loadTemplate = useCallback(async () => {
    try {
      setLoading(true);
      const data = await checklistsService.findOne(templateId);
      
      if (!data.is_modelo) {
        toast.error('Este checklist não é um template');
        router.push('/dashboard/checklist-templates');
        return;
      }
      
      setTemplate(data);
      setTitulo(data.titulo);
      setDescricao(data.descricao || '');
      setEquipamento(data.equipamento || '');
      setMaquina(data.maquina || '');
      setItens(data.itens || []);
    } catch (error) {
      console.error('Erro ao carregar template:', error);
      toast.error('Erro ao carregar template');
      router.push('/dashboard/checklist-templates');
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

      if (user?.id && !nextUsers.some((currentUser) => currentUser.id === user.id)) {
        try {
          const currentUser = await usersService.findOne(user.id);
          nextUsers = [currentUser, ...nextUsers];
        } catch {}
      }

      setUsers(
        Array.from(new Map(nextUsers.map((currentUser) => [currentUser.id, currentUser])).values()),
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

  const handleItemChange = <K extends keyof ChecklistItem>(
    index: number,
    field: K,
    value: ChecklistItem[K],
  ) => {
    const newItens = [...itens];
    newItens[index] = { ...newItens[index], [field]: value };
    setItens(newItens);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFotoEquipamento(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Validações básicas
      if (!titulo.trim()) {
        toast.error('Título é obrigatório');
        return;
      }
      if (!siteId) {
        toast.error('Obra/Setor é obrigatório');
        return;
      }
      if (!inspetorId) {
        toast.error('Inspetor é obrigatório');
        return;
      }

      // Criar checklist baseado no template
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
      setChecklistId(created.id);
      
      toast.success('Checklist preenchido com sucesso!');
      
      // Perguntar se quer assinar
      if (confirm('Deseja assinar o checklist agora?')) {
        setIsSignatureModalOpen(true);
      } else {
        router.push('/dashboard/checklists');
      }
    } catch (error) {
      console.error('Erro ao salvar checklist:', error);
      toast.error('Erro ao salvar checklist');
    } finally {
      setSaving(false);
    }
  };

  const handleSign = async (signatureData: string, type: string) => {
    if (!checklistId) return;
    
    try {
      await signaturesService.create({
        document_id: checklistId,
        document_type: 'CHECKLIST',
        signature_data: signatureData,
        type,
        user_id: user?.id || '',
      });
      
      toast.success('Assinatura registrada!');
      setIsSignatureModalOpen(false);
      
      // Salvar PDF automaticamente no R2
      toast.info('Salvando PDF no storage...');
      await checklistsService.savePdf(checklistId);
      toast.success('PDF salvo com sucesso!');
      
      // Perguntar se quer enviar por email
      if (confirm('Deseja enviar o checklist por email?')) {
        setPdfData({
          base64: '', // O backend vai gerar
          filename: `checklist-${checklistId}.pdf`,
        });
        setIsMailModalOpen(true);
      } else {
        router.push('/dashboard/checklists');
      }
    } catch (error) {
      console.error('Erro ao assinar:', error);
      toast.error('Erro ao assinar checklist');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[var(--ds-color-action-primary)] border-t-transparent" />
          <p className="text-[var(--ds-color-text-secondary)]">Carregando template...</p>
        </div>
      </div>
    );
  }

  if (!template) {
    return null;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/checklist-templates"
            className="flex items-center text-[var(--ds-color-text-secondary)] transition-colors hover:text-[var(--ds-color-text-primary)]"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Voltar
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">Preencher Checklist</h1>
            <p className="text-sm text-[var(--ds-color-text-muted)]">Template: {template.titulo}</p>
          </div>
        </div>
      </div>

      <div className={`${panelClassName} p-6 space-y-6`}>
        {/* Informações Básicas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="checklist-titulo" className={labelClassName}>
              Título *
            </label>
            <input
              id="checklist-titulo"
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              aria-label="Título do checklist"
              className={fieldClassName}
              required
            />
          </div>

          <div>
            <label htmlFor="checklist-data" className={labelClassName}>
              Data *
            </label>
            <input
              id="checklist-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              aria-label="Data do checklist"
              className={fieldClassName}
              required
            />
          </div>

          <div>
            <label htmlFor="checklist-site" className={labelClassName}>
              Obra/Setor *
            </label>
            <select
              id="checklist-site"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              aria-label="Obra ou setor do checklist"
              className={fieldClassName}
              required
            >
              <option value="">Selecione...</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="checklist-inspetor" className={labelClassName}>
              Inspetor *
            </label>
            <select
              id="checklist-inspetor"
              value={inspetorId}
              onChange={(e) => setInspetorId(e.target.value)}
              aria-label="Inspetor responsável"
              className={fieldClassName}
              required
            >
              <option value="">Selecione...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </div>

          {equipamento && (
            <div>
              <label htmlFor="checklist-equipamento" className={labelClassName}>
                Equipamento
              </label>
              <input
                id="checklist-equipamento"
                type="text"
                value={equipamento}
                onChange={(e) => setEquipamento(e.target.value)}
                aria-label="Equipamento do checklist"
                className={fieldClassName}
              />
            </div>
          )}

          {maquina && (
            <div>
              <label htmlFor="checklist-maquina" className={labelClassName}>
                Máquina
              </label>
              <input
                id="checklist-maquina"
                type="text"
                value={maquina}
                onChange={(e) => setMaquina(e.target.value)}
                aria-label="Máquina do checklist"
                className={fieldClassName}
              />
            </div>
          )}
        </div>

        <div>
          <label htmlFor="checklist-descricao" className={labelClassName}>
            Descrição
          </label>
          <textarea
            id="checklist-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            aria-label="Descrição do checklist"
            rows={3}
            className={fieldClassName}
          />
        </div>

        {/* Foto do Equipamento */}
        <div>
          <label htmlFor="checklist-foto-equipamento" className={labelClassName}>
            Foto do Equipamento
          </label>
          <input
            id="checklist-foto-equipamento"
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            aria-label="Foto do equipamento"
            className={fieldClassName}
          />
          {fotoEquipamento && (
            <Image
              src={fotoEquipamento}
              alt="Equipamento"
              width={320}
              height={240}
              className="mt-4 max-w-xs rounded-lg border"
              unoptimized
            />
          )}
        </div>

        {/* Itens do Checklist */}
        <div>
          <h3 className="mb-4 text-lg font-semibold text-[var(--ds-color-text-primary)]">Itens de Verificação</h3>
          <div className="space-y-4">
            {itens.map((item, index) => (
              <div
                key={index}
                className="rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-muted)]/22 p-4"
              >
                <div className="mb-3 font-medium text-[var(--ds-color-text-primary)]">{item.item}</div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor={`checklist-item-status-${index}`} className={labelClassName}>
                      Status
                    </label>
                    <select
                      id={`checklist-item-status-${index}`}
                      value={String(item.status)}
                      onChange={(e) =>
                        handleItemChange(index, 'status', e.target.value as ChecklistItem['status'])
                      }
                      aria-label={`Status do item ${item.item}`}
                      className={fieldClassName}
                    >
                      {item.tipo_resposta === 'sim_nao_na' ? (
                        <>
                          <option value="sim">Sim</option>
                          <option value="nao">Não</option>
                          <option value="na">N/A</option>
                        </>
                      ) : (
                        <>
                          <option value="ok">Conforme</option>
                          <option value="nok">Não Conforme</option>
                          <option value="na">N/A</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div>
                    <label htmlFor={`checklist-item-observacao-${index}`} className={labelClassName}>
                      Observação
                    </label>
                    <input
                      id={`checklist-item-observacao-${index}`}
                      type="text"
                      value={item.observacao || ''}
                      onChange={(e) => handleItemChange(index, 'observacao', e.target.value)}
                      aria-label={`Observação do item ${item.item}`}
                      className={fieldClassName}
                      placeholder="Observações adicionais..."
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex gap-4 border-t border-[var(--ds-color-border-subtle)] pt-6">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-[var(--ds-radius-md)] bg-[var(--ds-color-action-primary)] px-6 py-3 font-semibold text-[var(--ds-color-action-primary-foreground)] transition-colors hover:bg-[var(--ds-color-action-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-5 w-5" />
            {saving ? 'Salvando...' : 'Salvar e Assinar'}
          </button>
        </div>
      </div>

      {/* Modal de Assinatura */}
      <SignatureModal
        isOpen={isSignatureModalOpen && Boolean(checklistId)}
        onClose={() => setIsSignatureModalOpen(false)}
        onSave={(signatureData, type) => {
          void handleSign(signatureData, type);
        }}
        userName={users.find((item) => item.id === inspetorId)?.nome || user?.nome || 'Inspetor'}
      />

      {/* Modal de Email */}
      {isMailModalOpen && pdfData && checklistId && (
        <SendMailModal
          isOpen={isMailModalOpen}
          onClose={() => {
            setIsMailModalOpen(false);
            router.push('/dashboard/checklists');
          }}
          documentName={titulo}
          filename={pdfData.filename}
          base64={pdfData.base64}
        />
      )}
    </div>
  );
}
