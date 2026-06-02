import api from '@/lib/api';

export type OnboardingInviteResponse = {
  id: string;
  email: string;
  intended_company_name: string | null;
  expires_at: string;
  onboarding_url: string;
};

export type PublicOnboardingInvite = {
  email: string;
  intended_company_name: string | null;
  expires_at: string;
};

export type CompleteOnboardingPayload = {
  razao_social: string;
  cnpj: string;
  endereco: string;
  responsavel: string;
  email_contato: string;
  admin_nome: string;
  admin_cpf: string;
  admin_email: string;
  admin_password: string;
  termsAccepted: boolean;
};

export const tenantLifecycleService = {
  createInvite: async (data: {
    email: string;
    intended_company_name?: string;
    expiresInDays?: number;
  }) => {
    const response = await api.post<OnboardingInviteResponse>(
      '/tenant-lifecycle/invites',
      data,
    );
    return response.data;
  },

  getInvite: async (token: string) => {
    const response = await api.get<PublicOnboardingInvite>(
      `/tenant-lifecycle/onboarding/${encodeURIComponent(token)}`,
    );
    return response.data;
  },

  completeOnboarding: async (
    token: string,
    data: CompleteOnboardingPayload,
  ) => {
    const response = await api.post<{
      company_id: string;
      user_id: string;
      trial_ends_at: string;
    }>(
      `/tenant-lifecycle/onboarding/${encodeURIComponent(token)}/complete`,
      data,
    );
    return response.data;
  },
};
