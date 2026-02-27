'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ddsService } from '@/services/ddsService';
import { sitesService, Site } from '@/services/sitesService';
import { usersService, User } from '@/services/usersService';
import { useForm } from 'react-hook-form';
import type { FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft, Save, Sparkles, Loader2, Camera, Trash2 } from 'lucide-react';
import Link from 'next/link';
import NextImage from 'next/image';
import { toast } from 'sonner';
import { companiesService, Company } from '@/services/companiesService';
import { aiService } from '@/services/aiService';
import { SignatureModal } from '../app/dashboard/checklists/components/SignatureModal';
import { signaturesService } from '@/services/signaturesService';
import { AuditSection } from './AuditSection';
import { getFormErrorMessage } from '@/lib/error-handler';
import { attachPdfIfProvided } from '@/lib/document-upload';

const ddsSchema = z.object({
  tema: z.string().min(5, 'O tema deve ter pelo menos 5 caracteres'),
  conteudo: z.string().optional(),
  data: z.string(),
  company_id: z.string().min(1, 'Selecione uma empresa'),
  site_id: z.string().min(1, 'Selecione um site'),
  facilitador_id: z.string().min(1, 'Selecione um facilitador'),
  participants: z.array(z.string()).min(1, 'Selecione pelo menos um participante'),
  auditado_por_id: z.string().optional(),
  data_auditoria: z.string().optional(),
  resultado_auditoria: z.string().optional(),
  notas_auditoria: z.string().optional(),
});

type DdsFormData = z.infer<typeof ddsSchema>;

interface DdsFormProps {
  id?: string;
}

type TeamPhotoEvidence = {
  imageData: string;
  capturedAt: string;
  hash: string;
  metadata: TeamPhotoMetadata;
};

type TeamPhotoMetadata = {
  userAgent: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
};

type HistoricalPhotoReference = {
  ddsId: string;
  tema: string;
  data: string;
};

const TEAM_PHOTO_SIGNATURE_PREFIX = 'team_photo';
const TEAM_PHOTO_REUSE_JUSTIFICATION_TYPE = 'team_photo_reuse_justification';

export function DdsForm({ id }: DdsFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Signature States
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [currentSigningUser, setCurrentSigningUser] = useState<User | null>(null);
  const [signatures, setSignatures] = useState<Record<string, { data: string; type: string }>>({});
  const [teamPhotos, setTeamPhotos] = useState<TeamPhotoEvidence[]>([]);
  const [historicalPhotoHashes, setHistoricalPhotoHashes] = useState<Record<string, HistoricalPhotoReference>>({});
  const [photoReuseWarnings, setPhotoReuseWarnings] = useState<Record<string, HistoricalPhotoReference>>({});
  const [photoReuseJustification, setPhotoReuseJustification] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [ddsPdfFile, setDdsPdfFile] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    setFocus,
    formState: { errors, isValid, isSubmitting },
  } = useForm<DdsFormData>({
    resolver: zodResolver(ddsSchema),
    mode: 'onBlur',
    reValidateMode: 'onBlur',
    defaultValues: {
      tema: '',
      conteudo: '',
      data: new Date().toISOString().split('T')[0],
      company_id: '',
      site_id: '',
      facilitador_id: '',
      participants: [],
      auditado_por_id: '',
      data_auditoria: '',
      resultado_auditoria: '',
      notas_auditoria: '',
    },
  });

  const selectedCompanyId = watch('company_id');
  const filteredSites = sites.filter(site => site.company_id === selectedCompanyId);
  const filteredUsers = users.filter(user => user.company_id === selectedCompanyId);
  const selectedParticipantIds = watch('participants') || [];

  const handleAiSuggestion = async () => {
    try {
      setSuggesting(true);
      const result = await aiService.generateDds();
      
      setValue('tema', result.tema);
      setValue('conteudo', result.conteudo);

      toast.success('COMPLIANCE X sugeriu um tema para o DDS!', {
        description: result.explanation,
        duration: 5000,
      });
    } catch (error) {
      console.error('Erro na sugestão do COMPLIANCE X:', error);
      toast.error('Não foi possível obter uma sugestão no momento.');
    } finally {
      setSuggesting(false);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        const [companiesData, siteData, userData] = await Promise.all([
          companiesService.findAll(),
          sitesService.findAll(),
          usersService.findAll(),
        ]);
        setCompanies(companiesData);
        setSites(siteData);
        setUsers(userData);

        if (id) {
          const [dds, existingSignatures] = await Promise.all([
            ddsService.findOne(id),
            signaturesService.findByDocument(id, 'DDS'),
          ]);

          const participantSignatures: Record<string, { data: string; type: string }> = {};
          const loadedTeamPhotos: TeamPhotoEvidence[] = [];

          existingSignatures.forEach((sig) => {
            if (sig.type === TEAM_PHOTO_REUSE_JUSTIFICATION_TYPE) {
              setPhotoReuseJustification(sig.signature_data || '');
              return;
            }

            if (sig.type.startsWith(TEAM_PHOTO_SIGNATURE_PREFIX)) {
              try {
                const parsed = JSON.parse(sig.signature_data) as TeamPhotoEvidence;
                if (parsed?.imageData && parsed?.hash) {
                  loadedTeamPhotos.push(parsed);
                }
              } catch {
                loadedTeamPhotos.push({
                  imageData: sig.signature_data,
                  capturedAt: sig.created_at || new Date().toISOString(),
                  hash: 'indisponivel',
                  metadata: { userAgent: 'legacy' },
                });
              }
              return;
            }
            if (sig.user_id) {
              participantSignatures[sig.user_id] = {
                data: sig.signature_data,
                type: sig.type || 'participant',
              };
            }
          });

          setSignatures(participantSignatures);
          setTeamPhotos(loadedTeamPhotos);

          reset({
            tema: dds.tema,
            conteudo: dds.conteudo || '',
            data: new Date(dds.data).toISOString().split('T')[0],
            company_id: dds.company_id,
            site_id: dds.site_id,
            facilitador_id: dds.facilitador_id,
            participants: dds.participants.map((p) => p.id),
            auditado_por_id: dds.auditado_por_id || '',
            data_auditoria: dds.data_auditoria ? new Date(dds.data_auditoria).toISOString().split('T')[0] : '',
            resultado_auditoria: dds.resultado_auditoria || '',
            notas_auditoria: dds.notas_auditoria || '',
          });
        }
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
        toast.error('Erro ao carregar dados para o formulário.');
      } finally {
        setFetching(false);
      }
    }
    loadData();
  }, [id, reset]);

  useEffect(() => {
    async function loadHistoricalPhotoHashes(companyId: string) {
      try {
        const allDds = await ddsService.findAll();
        const targetDds = allDds
          .filter((item) => item.company_id === companyId && item.id !== id)
          .slice(0, 40);

        const signaturesByDds = await Promise.all(
          targetDds.map(async (item) => {
            const signs = await signaturesService.findByDocument(item.id, 'DDS');
            return { item, signs };
          }),
        );

        const nextHashes: Record<string, HistoricalPhotoReference> = {};
        signaturesByDds.forEach(({ item, signs }) => {
          signs
            .filter((sig) => sig.type.startsWith(TEAM_PHOTO_SIGNATURE_PREFIX))
            .forEach((sig) => {
              try {
                const parsed = JSON.parse(sig.signature_data) as TeamPhotoEvidence;
                if (parsed?.hash) {
                  nextHashes[parsed.hash] = {
                    ddsId: item.id,
                    tema: item.tema,
                    data: item.data,
                  };
                }
              } catch {
                // Ignora formatos legados sem hash
              }
            });
        });
        setHistoricalPhotoHashes(nextHashes);
      } catch (error) {
        console.error('Erro ao carregar hashes históricos de fotos do DDS:', error);
      }
    }

    if (selectedCompanyId) {
      loadHistoricalPhotoHashes(selectedCompanyId);
    } else {
      setHistoricalPhotoHashes({});
      setPhotoReuseWarnings({});
    }
  }, [selectedCompanyId, id]);

  useEffect(() => {
    const nextWarnings: Record<string, HistoricalPhotoReference> = {};
    teamPhotos.forEach((photo) => {
      const found = historicalPhotoHashes[photo.hash];
      if (found) {
        nextWarnings[photo.hash] = found;
      }
    });
    setPhotoReuseWarnings(nextWarnings);
  }, [teamPhotos, historicalPhotoHashes]);

  const getGeoMetadata = async (): Promise<TeamPhotoMetadata> => {
    const nav: Navigator | undefined = typeof window !== 'undefined' ? window.navigator : undefined;

    if (!nav) {
      return { userAgent: 'server' };
    }

    if (!nav.geolocation) {
      return { userAgent: nav.userAgent };
    }

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        nav.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 6000,
          maximumAge: 120000,
        });
      });

      return {
        userAgent: nav.userAgent,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
    } catch {
      return { userAgent: nav.userAgent };
    }
  };

  const sha256 = async (value: string): Promise<string> => {
    const data = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  };

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'));
      reader.readAsDataURL(file);
    });

  const resizeImageFile = async (file: File): Promise<string> => {
    const imageDataUrl = await fileToDataUrl(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Não foi possível processar a imagem.'));
      image.src = imageDataUrl;
    });

    const maxWidth = 1600;
    const maxHeight = 1200;
    let { width, height } = img;

    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Não foi possível otimizar a imagem.');
    }
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.8);
  };

  const handleTeamPhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    try {
      const geoMetadata = await getGeoMetadata();
      const processedPhotos = await Promise.all(
        Array.from(files).map(async (file) => {
          const imageData = await resizeImageFile(file);
          const hash = await sha256(imageData);
          return {
            imageData,
            hash,
            capturedAt: new Date().toISOString(),
            metadata: geoMetadata,
          } as TeamPhotoEvidence;
        }),
      );
      const hasPotentialReuse = processedPhotos.some((photo) => Boolean(historicalPhotoHashes[photo.hash]));
      if (hasPotentialReuse) {
        toast.warning('Detectamos foto(s) já usada(s) em DDS anterior desta empresa.');
      }
      setTeamPhotos((prev) => [...prev, ...processedPhotos].slice(0, 6));
      toast.success(`${processedPhotos.length} foto(s) auditável(is) adicionada(s) ao DDS.`);
    } catch (error) {
      console.error('Erro ao processar fotos da equipe:', error);
      toast.error('Não foi possível processar uma ou mais fotos.');
    } finally {
      event.target.value = '';
    }
  };

  async function onSubmit(data: DdsFormData) {
    try {
      setLoading(true);
      setSubmitError(null);
      let ddsId = id;
      const payload = { ...data };
      if (payload.conteudo === '') delete payload.conteudo;
      if (payload.auditado_por_id === '') delete payload.auditado_por_id;
      if (payload.data_auditoria === '') delete payload.data_auditoria;
      if (payload.resultado_auditoria === '') delete payload.resultado_auditoria;
      if (payload.notas_auditoria === '') delete payload.notas_auditoria;
      
      if (id) {
        await ddsService.update(id, payload);
        await attachPdfIfProvided(id, ddsPdfFile, ddsService.attachFile);
        toast.success('DDS atualizado com sucesso!');
      } else {
        if (ddsPdfFile) {
          const response = await ddsService.createWithFile(payload, ddsPdfFile);
          ddsId = response?.dds?.id || response?.id;
        } else {
          const newDds = await ddsService.create(payload);
          ddsId = newDds.id;
        }
        toast.success('DDS cadastrado com sucesso!');
      }

      const missingSignatureUsers = data.participants.filter((participantId) => !signatures[participantId]);
      if (missingSignatureUsers.length > 0) {
        setSubmitError('Todos os participantes selecionados devem assinar o DDS.');
        toast.error('Faltam assinaturas de participantes.');
        return;
      }

      if (Object.keys(photoReuseWarnings).length > 0 && photoReuseJustification.trim().length < 20) {
        setSubmitError(
          'Detectamos possível reuso de foto. Informe uma justificativa com pelo menos 20 caracteres para continuar.',
        );
        toast.error('Justificativa obrigatória para reuso de foto detectado.');
        return;
      }

      // Save signatures and team photos if we have a ddsId
      if (ddsId) {
        await signaturesService.deleteByDocument(ddsId as string, 'DDS');

        const participantSignaturePromises = data.participants.map((participantId) => {
          const sig = signatures[participantId];
          return signaturesService.create({
            user_id: participantId,
            document_id: ddsId as string,
            document_type: 'DDS',
            signature_data: sig.data,
            type: sig.type || 'participant',
          });
        });

        const teamPhotoPromises = teamPhotos.map((photo, index) =>
          signaturesService.create({
            user_id: data.facilitador_id,
            document_id: ddsId as string,
            document_type: 'DDS',
            signature_data: JSON.stringify(photo),
            type: `${TEAM_PHOTO_SIGNATURE_PREFIX}_${index + 1}`,
          })
        );

        const justificationPromise =
          Object.keys(photoReuseWarnings).length > 0
            ? [
                signaturesService.create({
                  user_id: data.facilitador_id,
                  document_id: ddsId as string,
                  document_type: 'DDS',
                  signature_data: photoReuseJustification.trim(),
                  type: TEAM_PHOTO_REUSE_JUSTIFICATION_TYPE,
                }),
              ]
            : [];

        const allPromises = [...participantSignaturePromises, ...teamPhotoPromises, ...justificationPromise];
        if (allPromises.length > 0) {
          await Promise.all(allPromises);
          toast.success(
            `DDS salvo com ${participantSignaturePromises.length} assinatura(s) e ${teamPhotoPromises.length} foto(s) da equipe.`,
          );
        }
      }

      router.push('/dashboard/dds');
      router.refresh();
    } catch (error) {
      console.error('Erro ao salvar DDS:', error);
      const errorMessage = getFormErrorMessage(error, {
        badRequest: 'Dados inválidos. Revise os campos obrigatórios.',
        unauthorized: 'Sessão expirada. Faça login novamente.',
        forbidden: 'Você não tem permissão para salvar DDS.',
        server: 'Erro interno do servidor ao salvar DDS.',
        fallback: 'Erro ao salvar DDS. Tente novamente.',
      });
      setSubmitError(errorMessage);
      toast.error('Erro ao salvar DDS. Verifique os dados e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const onInvalid = (formErrors: FieldErrors<DdsFormData>) => {
    if (formErrors.tema) {
      setFocus('tema');
    } else if (formErrors.company_id) {
      setFocus('company_id');
    } else if (formErrors.site_id) {
      setFocus('site_id');
    } else if (formErrors.facilitador_id) {
      setFocus('facilitador_id');
    }
    toast.error('Revise os campos obrigatórios antes de salvar.');
  };

  const toggleParticipant = (userId: string) => {
    const isSelected = selectedParticipantIds.includes(userId);
    
    if (isSelected) {
      // If already selected, just remove
      const updated = selectedParticipantIds.filter(id => id !== userId);
      setValue('participants', updated, { shouldValidate: true });
      // Also remove temporary signature if exists
      const newSignatures = { ...signatures };
      delete newSignatures[userId];
      setSignatures(newSignatures);
    } else {
      // If not selected, open signature modal first
      const user = users.find(u => u.id === userId);
      if (user) {
        setCurrentSigningUser(user);
        setIsSignatureModalOpen(true);
      }
    }
  };

  const handleSaveSignature = (signatureData: string, type: string) => {
    if (currentSigningUser) {
      setSignatures(prev => ({
        ...prev,
        [currentSigningUser.id]: { data: signatureData, type }
      }));
      
      const updated = [...selectedParticipantIds, currentSigningUser.id];
      setValue('participants', updated, { shouldValidate: true });
      toast.success(`Assinatura de ${currentSigningUser.nome} capturada!`);
    }
  };

  if (fetching) {
    return (
      <div className="flex justify-center py-10">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            href="/dashboard/dds"
            className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {id ? 'Editar DDS' : 'Novo DDS'}
          </h1>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-8">
        {submitError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {submitError}
          </div>
        )}
        <div className="sst-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Informações Básicas</h2>
            <button
              type="button"
              onClick={handleAiSuggestion}
              disabled={suggesting}
              className="flex items-center space-x-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-bold text-white shadow-md transition-all hover:bg-[#1E40AF] disabled:opacity-50"
            >
              {suggesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              <span>Sugerir Tema com COMPLIANCE X</span>
            </button>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Tema do DDS</label>
              <input
                type="text"
                {...register('tema')}
                className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-none ${
                  errors.tema ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
                }`}
                aria-invalid={Boolean(errors.tema)}
                placeholder="Ex: Importância do uso de EPIs"
              />
              {errors.tema && <p className="mt-1 text-xs text-red-500">{errors.tema.message}</p>}
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Conteúdo / Resumo</label>
              <textarea
                {...register('conteudo')}
                rows={5}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Descreva brevemente os pontos abordados no DDS..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Data</label>
              <input
                type="date"
                {...register('data')}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                PDF do DDS (opcional)
              </label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  setDdsPdfFile(file || null);
                }}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
              />
              <p className="mt-1 text-xs text-gray-500">
                Se anexado no cadastro, o backend salva automaticamente em pasta por empresa/ano/semana.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Empresa</label>
              <select
                {...register('company_id')}
                onChange={(e) => {
                  setValue('company_id', e.target.value);
                  setValue('site_id', '');
                  setValue('facilitador_id', '');
                  setValue('participants', []);
                }}
                className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-none ${
                  errors.company_id ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
                }`}
                aria-invalid={Boolean(errors.company_id)}
              >
                <option value="">Selecione uma empresa</option>
                {companies.map(company => (
                  <option key={company.id} value={company.id}>{company.razao_social}</option>
                ))}
              </select>
              {errors.company_id && <p className="mt-1 text-xs text-red-500">{errors.company_id.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Site/Unidade</label>
              <select
                {...register('site_id')}
                disabled={!selectedCompanyId}
                className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-none ${
                  !selectedCompanyId ? 'bg-gray-100 cursor-not-allowed border-gray-300' : 
                  errors.site_id ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
                }`}
                aria-invalid={Boolean(errors.site_id)}
              >
                <option value="">{selectedCompanyId ? 'Selecione um site' : 'Selecione uma empresa primeiro'}</option>
                {filteredSites.map(site => (
                  <option key={site.id} value={site.id}>{site.nome}</option>
                ))}
              </select>
              {errors.site_id && <p className="mt-1 text-xs text-red-500">{errors.site_id.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Facilitador</label>
              <select
                {...register('facilitador_id')}
                disabled={!selectedCompanyId}
                className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm focus:outline-none ${
                  !selectedCompanyId ? 'bg-gray-100 cursor-not-allowed border-gray-300' :
                  errors.facilitador_id ? 'border-red-500 focus:border-red-500' : 'border-gray-300 focus:border-blue-500'
                }`}
                aria-invalid={Boolean(errors.facilitador_id)}
              >
                <option value="">{selectedCompanyId ? 'Selecione um facilitador' : 'Selecione uma empresa primeiro'}</option>
                {filteredUsers.map(user => (
                  <option key={user.id} value={user.id}>{user.nome}</option>
                ))}
              </select>
              {errors.facilitador_id && <p className="mt-1 text-xs text-red-500">{errors.facilitador_id.message}</p>}
            </div>
          </div>
        </div>

        <div className="sst-card p-6">
          <h2 className="mb-4 flex items-center justify-between text-lg font-bold text-gray-900">
            Participantes
            <span className="text-xs font-normal text-gray-500">{selectedParticipantIds.length} selecionados</span>
          </h2>
          {!selectedCompanyId ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-8 text-center text-sm text-gray-500">
              Selecione uma empresa para listar os participantes
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-8 text-center text-sm text-gray-500">
              Nenhum usuário encontrado para esta empresa
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
              {filteredUsers.map(user => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => toggleParticipant(user.id)}
                  className={`flex items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors ${
                    selectedParticipantIds.includes(user.id)
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span>{user.nome}</span>
                  {selectedParticipantIds.includes(user.id) && (
                    <div className="h-2 w-2 rounded-full bg-blue-600" />
                  )}
                </button>
              ))}
            </div>
          )}
          {errors.participants && <p className="mt-1 text-xs text-red-500">{errors.participants.message}</p>}
        </div>

        <div className="sst-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Registro Fotográfico da Equipe</h2>
              <p className="text-xs text-gray-500">Use a câmera do celular para registrar presença e evidência do DDS.</p>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#2563EB] px-3 py-2 text-sm font-medium text-white hover:bg-[#1E40AF]">
              <Camera className="h-4 w-4" />
              Adicionar Foto
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={handleTeamPhotoChange}
              />
            </label>
          </div>

          {teamPhotos.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-6 text-center text-sm text-gray-500">
              Nenhuma foto adicionada. Recomendado: anexar pelo menos 1 foto da equipe.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {teamPhotos.map((photo, index) => (
                <div key={`${index}-${photo.hash.slice(0, 12)}`} className="relative overflow-hidden rounded-lg border">
                  <NextImage
                    src={photo.imageData}
                    alt={`Foto da equipe ${index + 1}`}
                    width={600}
                    height={300}
                    className="h-36 w-full object-cover"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-[10px] text-white">
                    Hash: {photo.hash.slice(0, 12)}...
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setTeamPhotos((prev) => prev.filter((_, i) => i !== index))
                    }
                    className="absolute right-2 top-2 rounded-md bg-white/90 p-1 text-red-600 hover:bg-white"
                    title="Remover foto"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {Object.keys(photoReuseWarnings).length > 0 && (
            <div className="mt-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <p className="font-semibold">Alerta de possível reuso de imagem:</p>
              {Object.entries(photoReuseWarnings).map(([hash, ref]) => (
                <p key={hash}>
                  Hash {hash.slice(0, 12)}... já apareceu no DDS &quot;{ref.tema}&quot; ({new Date(ref.data).toLocaleDateString('pt-BR')}).
                </p>
              ))}
              <div className="pt-2">
                <label className="mb-1 block text-xs font-semibold text-amber-900">
                  Justificativa de exceção (obrigatória para salvar)
                </label>
                <textarea
                  value={photoReuseJustification}
                  onChange={(event) => setPhotoReuseJustification(event.target.value)}
                  className="w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-xs text-gray-900 focus:border-amber-500 focus:outline-none"
                  rows={3}
                  placeholder="Explique por que a mesma foto está sendo reutilizada neste DDS."
                />
              </div>
            </div>
          )}
        </div>

        <div className="sst-card p-6">
          <h2 className="mb-4 text-lg font-bold text-gray-900">Seção de Auditoria</h2>
          <AuditSection
            register={register}
            auditors={filteredUsers.filter(u => u.role === 'admin' || u.role === 'manager')}
            disabled={!selectedCompanyId}
          />
        </div>

        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-[#E5E7EB] px-6 py-2 text-sm font-medium text-[#374151] hover:bg-[#E5E7EB]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading || isSubmitting || !isValid}
            className="flex items-center space-x-2 rounded-lg bg-[#2563EB] px-6 py-2 text-sm font-medium text-white hover:bg-[#1E40AF] disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            <span>{loading ? 'Salvando...' : 'Salvar DDS'}</span>
          </button>
        </div>
      </form>

      {isSignatureModalOpen && currentSigningUser && (
        <SignatureModal
          isOpen={isSignatureModalOpen}
          onClose={() => setIsSignatureModalOpen(false)}
          onSave={handleSaveSignature}
          userName={currentSigningUser.nome}
        />
      )}
    </div>
  );
}
