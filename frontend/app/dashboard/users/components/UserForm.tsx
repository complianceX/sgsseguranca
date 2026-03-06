'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usersService } from '@/services/usersService';
import { companiesService, Company } from '@/services/companiesService';
import { profilesService, Profile } from '@/services/profilesService';
import { sitesService, Site } from '@/services/sitesService';
import { useAuth } from '@/context/AuthContext';
import { handleApiError } from '@/lib/error-handler';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { useFormSubmit } from '@/hooks/useFormSubmit';
import { Button } from '@/components/ui/button';

const userSchema = z.object({
  nome: z.string().min(3, 'O nome deve ter pelo menos 3 caracteres'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  cpf: z.string().min(11, 'CPF inválido'),
  funcao: z.string().min(2, 'A função é obrigatória'),
  role: z.string().optional().or(z.literal('')),
  company_id: z.string().min(1, 'Selecione uma empresa'),
  site_id: z.string().optional().or(z.literal('')),
  profile_id: z.string().optional().or(z.literal('')),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres').optional().or(z.literal('')),
});

type UserFormData = z.infer<typeof userSchema>;

interface UserFormProps {
  id?: string;
}

export function UserForm({ id }: UserFormProps) {
  const router = useRouter();
  const [fetching, setFetching] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const { user } = useAuth();

  const isEmployeePath = typeof window !== 'undefined' && window.location.pathname.includes('/employees');
  const backPath = isEmployeePath ? '/dashboard/employees' : '/dashboard/users';

  const {
    register,
    handleSubmit: formSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      nome: '',
      email: '',
      cpf: '',
      funcao: '',
      role: '',
      company_id: '',
      site_id: '',
      profile_id: '',
      password: '',
    },
  });

  const selectedCompanyId = useWatch({
    control,
    name: 'company_id',
  });

  const { handleSubmit: onSubmit, loading } = useFormSubmit(
    async (data: UserFormData) => {
      const payload: Record<string, unknown> = {
        ...data,
        cpf: data.cpf.replace(/\D/g, ''),
      };
      
      if (isEmployeePath && !id) {
        const colaboradorProfile = profiles.find(p => p.nome === 'Operador / Colaborador');
        if (colaboradorProfile) {
          payload.profile_id = colaboradorProfile.id;
        }
      }

      // Cleanup payload
      if (payload.email === '') delete payload.email;
      delete payload.role;
      if (payload.site_id === '') payload.site_id = null;
      if (payload.profile_id === '') delete payload.profile_id;
      if (!payload.password) delete payload.password;

      if (id) {
        await usersService.update(id, payload);
      } else {
        if (!isEmployeePath && !payload.password) {
          throw new Error('Senha é obrigatória para novos usuários.');
        }
        if (!isEmployeePath && !payload.profile_id) {
          throw new Error('Selecione um perfil de acesso.');
        }
        await usersService.create(payload);
      }
    },
    {
      successMessage: id 
        ? `${isEmployeePath ? 'Funcionário' : 'Usuário'} atualizado com sucesso!` 
        : `${isEmployeePath ? 'Funcionário' : 'Usuário'} cadastrado com sucesso!`,
      redirectTo: backPath,
      context: isEmployeePath ? 'Funcionário' : 'Usuário'
    }
  );

  useEffect(() => {
    async function loadData() {
      try {
        const [companiesData, profilesData] = await Promise.all([
          companiesService.findAll(),
          profilesService.findAll(),
        ]);
        setCompanies(companiesData);
        setProfiles(profilesData);

        if (id) {
          const userData = await usersService.findOne(id);
          reset({
            nome: userData.nome,
            email: userData.email,
            cpf: userData.cpf,
            funcao: userData.funcao || '',
            role: userData.role,
            company_id: userData.company_id,
            site_id: userData.site_id || '',
            profile_id: userData.profile_id,
          });
        }
      } catch (error) {
        handleApiError(error, 'Formulário');
        router.push(backPath);
      } finally {
        setFetching(false);
      }
    }

    loadData();
  }, [id, reset, router, backPath]);

  useEffect(() => {
    async function loadSites() {
      if (!selectedCompanyId) {
        setSites([]);
        return;
      }
      try {
        const sitesData = await sitesService.findAll(selectedCompanyId);
        if (sitesData.length > 0) {
          setSites(sitesData);
          return;
        }
        const allSites = await sitesService.findAll();
        setSites(allSites.filter((site) => site.company_id === selectedCompanyId));
      } catch (error) {
        handleApiError(error, 'Obras');
        setSites([]);
      }
    }
    loadSites();
  }, [selectedCompanyId]);

  useEffect(() => {
    if (!id && !selectedCompanyId && user?.company_id) {
      setValue('company_id', user.company_id);
    }
  }, [id, selectedCompanyId, setValue, user?.company_id]);

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
            href={backPath}
            className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">
            {id ? `Editar ${isEmployeePath ? 'Funcionário' : 'Usuário'}` : `Novo ${isEmployeePath ? 'Funcionário' : 'Usuário'}`}
          </h1>
        </div>
      </div>

      <form onSubmit={formSubmit(onSubmit)} className="space-y-6 rounded-xl border bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <label htmlFor="nome" className="text-sm font-medium text-gray-700">
              Nome Completo
            </label>
            <input
              id="nome"
              type="text"
              {...register('nome')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Nome do usuário"
            />
            {errors.nome && (
              <p className="text-xs text-red-500">{errors.nome.message}</p>
            )}
          </div>

          {!isEmployeePath && (
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-gray-700">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                {...register('email')}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="email@exemplo.com"
              />
              {errors.email && (
                <p className="text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="cpf" className="text-sm font-medium text-gray-700">
              CPF
            </label>
            <input
              id="cpf"
              type="text"
              {...register('cpf')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="000.000.000-00"
            />
            {errors.cpf && (
              <p className="text-xs text-red-500">{errors.cpf.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="funcao" className="text-sm font-medium text-gray-700">
              Função
            </label>
            <input
              id="funcao"
              type="text"
              {...register('funcao')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Ex: Engenheiro de Segurança"
            />
          </div>

          {!isEmployeePath && (
            <div className="space-y-2">
              <label htmlFor="role" className="text-sm font-medium text-gray-700">
                Regra (Role)
              </label>
              <select
                id="role"
                {...register('role')}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">Selecione uma regra</option>
                <option value="admin">Administrador</option>
                <option value="user">Usuário</option>
                <option value="manager">Gerente</option>
              </select>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="company_id" className="text-sm font-medium text-gray-700">
              Empresa
            </label>
            <select
              id="company_id"
              {...register('company_id', {
                onChange: (e) => {
                  setValue('company_id', e.target.value);
                  setValue('site_id', '');
                },
              })}
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

          <div className="space-y-2">
            <label htmlFor="site_id" className="text-sm font-medium text-gray-700">
              Obra/Setor
            </label>
            <select
              id="site_id"
              {...register('site_id')}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              disabled={!selectedCompanyId}
            >
              <option value="">Selecione uma obra (opcional)</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.nome}
                </option>
              ))}
            </select>
          </div>

          {!isEmployeePath && (
            <div className="space-y-2">
              <label htmlFor="profile_id" className="text-sm font-medium text-gray-700">
                Perfil de Acesso
              </label>
              <select
                id="profile_id"
                {...register('profile_id')}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">Selecione um perfil</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!isEmployeePath && (
            <div className="space-y-2 md:col-span-2">
              <label htmlFor="password" className="text-sm font-medium text-gray-700">
                Senha {id && '(deixe em branco para não alterar)'}
              </label>
              <input
                id="password"
                type="password"
                {...register('password')}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="******"
              />
              {errors.password && (
                <p className="text-xs text-red-500">{errors.password.message}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-4 border-t pt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(backPath)}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            loading={loading}
            leftIcon={<Save className="h-4 w-4" />}
          >
            {id ? 'Salvar Alterações' : 'Criar Usuário'}
          </Button>
        </div>
      </form>
    </div>
  );
}
