'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { checklistsService, Checklist, ChecklistItem } from '@/services/checklistsService';
import { sitesService, Site } from '@/services/sitesService';
import { usersService, User } from '@/services/usersService';
import { signaturesService } from '@/services/signaturesService';
import { ArrowLeft, Save, PenTool, Send, Printer, FileDown } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { SendMailModal } from '@/components/SendMailModal';

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

  useEffect(() => {
    loadTemplate();
    loadSites();
    loadUsers();
  }, [templateId, user?.id]);

  const loadTemplate = async () => {
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
  };

  const loadSites = async () => {
    try {
      const page = await sitesService.findPaginated({ page: 1, limit: 100 });
      setSites(page.data);
    } catch (error) {
      console.error('Erro ao carregar obras:', error);
    }
  };

  const loadUsers = async () => {
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
  };

  const handleItemChange = (index: number, field: keyof ChecklistItem, value: any) => {
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

  const handleSign = async (signatureData: string) => {
    if (!checklistId) return;
    
    try {
      await signaturesService.create({
        document_id: checklistId,
        document_type: 'CHECKLIST',
        signature_data: signatureData,
        type: 'digital',
        user_id: user?.id || '',
      });
      
      toast.success('Assinatura registrada!');
      setIsSignatureModalOpen(false);
      
      // Salvar PDF automaticamente no R2
      toast.info('Salvando PDF no storage...');
      const pdfResult = await checklistsService.savePdf(checklistId);
      toast.success('PDF salvo com sucesso!');
      
      // Perguntar se quer enviar por email
      if (confirm('Deseja enviar o checklist por email?')) {
        // Gerar PDF para envio
        const pdfResponse = await checklistsService.getPdfAccess(checklistId);
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

  const handlePrint = () => {
    if (checklistId) {
      window.open(`/dashboard/checklists/${checklistId}/print`, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando template...</p>
        </div>
      </div>
    );
  }

  if (!template) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/checklist-templates"
            className="flex items-center text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-5 w-5 mr-2" />
            Voltar
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Preencher Checklist</h1>
            <p className="text-sm text-gray-500">Template: {template.titulo}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-6 space-y-6">
        {/* Informações Básicas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="checklist-titulo" className="block text-sm font-medium text-gray-700 mb-2">
              Título *
            </label>
            <input
              id="checklist-titulo"
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              aria-label="Título do checklist"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              required
            />
          </div>

          <div>
            <label htmlFor="checklist-data" className="block text-sm font-medium text-gray-700 mb-2">
              Data *
            </label>
            <input
              id="checklist-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              aria-label="Data do checklist"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              required
            />
          </div>

          <div>
            <label htmlFor="checklist-site" className="block text-sm font-medium text-gray-700 mb-2">
              Obra/Setor *
            </label>
            <select
              id="checklist-site"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              aria-label="Obra ou setor do checklist"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
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
            <label htmlFor="checklist-inspetor" className="block text-sm font-medium text-gray-700 mb-2">
              Inspetor *
            </label>
            <select
              id="checklist-inspetor"
              value={inspetorId}
              onChange={(e) => setInspetorId(e.target.value)}
              aria-label="Inspetor responsável"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
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
              <label htmlFor="checklist-equipamento" className="block text-sm font-medium text-gray-700 mb-2">
                Equipamento
              </label>
              <input
                id="checklist-equipamento"
                type="text"
                value={equipamento}
                onChange={(e) => setEquipamento(e.target.value)}
                aria-label="Equipamento do checklist"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          )}

          {maquina && (
            <div>
              <label htmlFor="checklist-maquina" className="block text-sm font-medium text-gray-700 mb-2">
                Máquina
              </label>
              <input
                id="checklist-maquina"
                type="text"
                value={maquina}
                onChange={(e) => setMaquina(e.target.value)}
                aria-label="Máquina do checklist"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          )}
        </div>

        <div>
          <label htmlFor="checklist-descricao" className="block text-sm font-medium text-gray-700 mb-2">
            Descrição
          </label>
          <textarea
            id="checklist-descricao"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            aria-label="Descrição do checklist"
            rows={3}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>

        {/* Foto do Equipamento */}
        <div>
          <label htmlFor="checklist-foto-equipamento" className="block text-sm font-medium text-gray-700 mb-2">
            Foto do Equipamento
          </label>
          <input
            id="checklist-foto-equipamento"
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            aria-label="Foto do equipamento"
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          {fotoEquipamento && (
            <img
              src={fotoEquipamento}
              alt="Equipamento"
              className="mt-4 max-w-xs rounded-lg border"
            />
          )}
        </div>

        {/* Itens do Checklist */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Itens de Verificação</h3>
          <div className="space-y-4">
            {itens.map((item, index) => (
              <div key={index} className="border rounded-lg p-4 bg-gray-50">
                <div className="font-medium text-gray-900 mb-3">{item.item}</div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor={`checklist-item-status-${index}`} className="block text-sm font-medium text-gray-700 mb-2">
                      Status
                    </label>
                    <select
                      id={`checklist-item-status-${index}`}
                      value={String(item.status)}
                      onChange={(e) => handleItemChange(index, 'status', e.target.value)}
                      aria-label={`Status do item ${item.item}`}
                      className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                    <label htmlFor={`checklist-item-observacao-${index}`} className="block text-sm font-medium text-gray-700 mb-2">
                      Observação
                    </label>
                    <input
                      id={`checklist-item-observacao-${index}`}
                      type="text"
                      value={item.observacao || ''}
                      onChange={(e) => handleItemChange(index, 'observacao', e.target.value)}
                      aria-label={`Observação do item ${item.item}`}
                      className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="Observações adicionais..."
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex gap-4 pt-6 border-t">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-5 w-5" />
            {saving ? 'Salvando...' : 'Salvar e Assinar'}
          </button>
        </div>
      </div>

      {/* Modal de Assinatura */}
      {isSignatureModalOpen && checklistId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Assinar Checklist</h3>
            <p className="text-sm text-gray-600 mb-4">
              Desenhe sua assinatura abaixo:
            </p>
            <canvas
              id="signature-canvas"
              className="border rounded-lg w-full h-48 cursor-crosshair"
              onMouseDown={(e) => {
                const canvas = e.currentTarget;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.beginPath();
                  ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
                  canvas.onmousemove = (moveEvent) => {
                    ctx.lineTo(moveEvent.offsetX, moveEvent.offsetY);
                    ctx.stroke();
                  };
                }
              }}
              onMouseUp={(e) => {
                e.currentTarget.onmousemove = null;
              }}
            />
            <div className="flex gap-4 mt-4">
              <button
                onClick={() => {
                  const canvas = document.getElementById('signature-canvas') as HTMLCanvasElement;
                  const ctx = canvas?.getContext('2d');
                  if (ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                  }
                }}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Limpar
              </button>
              <button
                onClick={() => {
                  const canvas = document.getElementById('signature-canvas') as HTMLCanvasElement;
                  const signatureData = canvas?.toDataURL();
                  if (signatureData) {
                    handleSign(signatureData);
                  }
                }}
                className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

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
