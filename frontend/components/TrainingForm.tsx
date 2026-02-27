'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { trainingsService } from '@/services/trainingsService';
import { usersService, User } from '@/services/usersService';
import { companiesService, Company } from '@/services/companiesService';
import { signaturesService } from '@/services/signaturesService';
import { SignatureModal } from './SignatureModal';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft, Save, PenTool, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

const trainingSchema = z.object({
  nome: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres'),
  data_conclusao: z.string().min(1, 'Data de conclusão é obrigatória'),
  data_vencimento: z.string().min(1, 'Data de vencimento é obrigatória'),
  certificado_url: z.string().optional().or(z.literal('')),
  user_id: z.string().min(1, 'Selecione um colaborador'),
  company_id: z.string().min(1, 'Selecione uma empresa'),
  auditado_por_id: z.string().optional(),
  data_auditoria: z.string().optional(),
  resultado_auditoria: z.string().optional(),
  notas_auditoria: z.string().optional(),
});

type TrainingFormData = z.infer<typeof trainingSchema>;

interface TrainingFormProps {
  id?: string;
}

import { AuditSection } from './AuditSection';

export function TrainingForm({ id }: TrainingFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);

  // Estados para assinaturas
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [signatures, setSignatures] = useState<Record<string, { data: string, type: string }>>({});
  const [currentSigningUser, setCurrentSigningUser] = useState<User | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TrainingFormData>({
    resolver: zodResolver(trainingSchema),
    defaultValues: {
      nome: '',
      data_conclusao: '',
      data_vencimento: '',
      certificado_url: '',
      user_id: '',
      company_id: '',
      auditado_por_id: '',
      data_auditoria: '',
      resultado_auditoria: '',
      notas_auditoria: '',
    },
  });

  const selectedCompanyId = watch('company_id');

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [companiesData, usersData] = await Promise.all([
          companiesService.findAll(),
          usersService.findAll(),
        ]);
        setCompanies(companiesData);
        setUsers(usersData);

        if (id) {
          const [trainingData, docSignatures] = await Promise.all([
            trainingsService.findOne(id),
            signaturesService.findByDocument(id, 'TRAINING')
          ]);

          reset({
            nome: trainingData.nome,
            data_conclusao: new Date(trainingData.data_conclusao).toISOString().split('T')[0],
            data_vencimento: new Date(trainingData.data_vencimento).toISOString().split('T')[0],
            certificado_url: trainingData.certificado_url || '',
            user_id: trainingData.user_id,
            company_id: trainingData.company_id,
            auditado_por_id: trainingData.auditado_por_id || '',
            data_auditoria: trainingData.data_auditoria ? new Date(trainingData.data_auditoria).toISOString().split('T')[0] : '',
            resultado_auditoria: trainingData.resultado_auditoria || '',
            notas_auditoria: trainingData.notas_auditoria || '',
          });

          // Carregar assinaturas existentes
          const sigs: Record<string, { data: string, type: string }> = {};
          docSignatures.forEach(sig => {
            const data = sig.signature_data.startsWith('data:image') 
              ? sig.signature_data 
              : `data:image/png;base64,${sig.signature_data}`;
            sigs[sig.user_id] = { data, type: sig.type };
          });
          setSignatures(sigs);
        }
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
        toast.error('Erro ao carregar dados para o formulário.');
        router.push('/dashboard/trainings');
      } finally {
        setFetching(false);
      }
    }

    loadInitialData();
  }, [id, reset, router]);

  useEffect(() => {
    if (selectedCompanyId) {
      const filtered = users.filter(u => u.company_id === selectedCompanyId);
      setFilteredUsers(filtered);
    } else {
      setFilteredUsers([]);
    }
  }, [selectedCompanyId, users]);

  const handleOpenSignature = () => {
    const userId = watch('user_id');
    if (!userId) {
      toast.error('Selecione um colaborador primeiro.');
      return;
    }
    const user = users.find(u => u.id === userId);
    if (user) {
      setCurrentSigningUser(user);
      setIsSignatureModalOpen(true);
    }
  };

  const handleSaveSignature = (signatureData: string, type: string) => {
    const userId = watch('user_id');
    if (userId) {
      setSignatures({
        [userId]: { data: signatureData, type }
      });
      toast.success('Assinatura do colaborador capturada!');
    }
  };

  async function onSubmit(data: TrainingFormData) {
    const userId = watch('user_id');
    if (!signatures[userId]) {
      toast.error('A assinatura do colaborador é obrigatória.');
      return;
    }

    try {
      setLoading(true);
      let training;
      if (id) {
        training = await trainingsService.update(id, data);
        toast.success('Treinamento atualizado com sucesso!');
      } else {
        training = await trainingsService.create(data);
        toast.success('Treinamento registrado com sucesso!');
      }

      // Salvar assinatura
      const trainingId = id || training.id;
      await signaturesService.create({
        document_id: trainingId,
        document_type: 'TRAINING',
        user_id: userId,
        signature_data: signatures[userId].data,
        type: signatures[userId].type
      });

      router.push('/dashboard/trainings');
      router.refresh();
    } catch (error) {
      console.error('Erro ao salvar treinamento:', error);
      toast.error('Erro ao salvar treinamento. Verifique os dados e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  if (fetching) {
    return (
      <div className="flex justify-center py-10">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            href="/dashboard/trainings"
            className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {id ? 'Editar Treinamento' : 'Novo Treinamento'}
          </h1>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 rounded-xl border bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <label htmlFor="company_id" className="text-sm font-medium text-gray-700">
              Empresa
            </label>
            <select
              id="company_id"
              {...register('company_id')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">Selecione uma empresa</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.razao_social}
                </option>
              ))}
            </select>
            {errors.company_id && (
              <p className="text-xs text-red-500">{errors.company_id.message}</p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <label htmlFor="user_id" className="text-sm font-medium text-gray-700">
              Colaborador
            </label>
            <div className="flex space-x-2">
              <select
                id="user_id"
                {...register('user_id')}
                disabled={!selectedCompanyId}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50"
                onChange={(e) => {
                  setValue('user_id', e.target.value);
                  setSignatures({}); // Limpar assinatura se o colaborador mudar
                }}
              >
                <option value="">Selecione um colaborador</option>
                {filteredUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.nome} - {user.funcao}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleOpenSignature}
                disabled={!watch('user_id')}
                className={`flex items-center space-x-2 rounded-md px-3 py-2 text-sm font-medium shadow-sm transition-all ${
                  signatures[watch('user_id')] 
                    ? 'bg-green-100 text-green-700 border border-green-200' 
                    : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                }`}
              >
                {signatures[watch('user_id')] ? (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    <span>Assinado</span>
                  </>
                ) : (
                  <>
                    <PenTool className="h-4 w-4" />
                    <span>Assinar</span>
                  </>
                )}
              </button>
            </div>
            {errors.user_id && (
              <p className="text-xs text-red-500">{errors.user_id.message}</p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <label htmlFor="nome" className="text-sm font-medium text-gray-700">
              Nome do Treinamento / NR
            </label>
            <input
              id="nome"
              type="text"
              {...register('nome')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Ex: NR-35 Trabalho em Altura"
            />
            {errors.nome && (
              <p className="text-xs text-red-500">{errors.nome.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="data_conclusao" className="text-sm font-medium text-gray-700">
              Data de Conclusão
            </label>
            <input
              id="data_conclusao"
              type="date"
              {...register('data_conclusao')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            {errors.data_conclusao && (
              <p className="text-xs text-red-500">{errors.data_conclusao.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="data_vencimento" className="text-sm font-medium text-gray-700">
              Data de Vencimento
            </label>
            <input
              id="data_vencimento"
              type="date"
              {...register('data_vencimento')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            {errors.data_vencimento && (
              <p className="text-xs text-red-500">{errors.data_vencimento.message}</p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <label htmlFor="certificado_url" className="text-sm font-medium text-gray-700">
              URL do Certificado (Opcional)
            </label>
            <input
              id="certificado_url"
              type="url"
              {...register('certificado_url')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="https://..."
            />
          </div>

          {/* Seção de Auditoria */}
          <div className="md:col-span-2 mt-6 pt-6 border-t">
            <AuditSection
              register={register}
              auditors={users.filter(u => u.role === 'admin' || u.role === 'manager')}
              disabled={!selectedCompanyId}
            />
          </div>
        </div>

        <div className="flex justify-end space-x-4 border-t pt-6">
          <Link
            href="/dashboard/trainings"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? (
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {id ? 'Salvar Alterações' : 'Registrar Treinamento'}
          </button>
        </div>
      </form>

      <SignatureModal
        isOpen={isSignatureModalOpen}
        onClose={() => setIsSignatureModalOpen(false)}
        onSave={handleSaveSignature}
        userName={currentSigningUser?.nome || 'Colaborador'}
      />
    </div>
  );
}
