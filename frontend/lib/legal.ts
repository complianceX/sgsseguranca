type MissingLegalField = {
  envName: string;
  label: string;
};

export type PublicLegalConfig = {
  companyName: string | null;
  companyDocument: string | null;
  companyAddress: string | null;
  privacyEmail: string | null;
  supportEmail: string | null;
  contactEmail: string | null;
  dpoName: string | null;
  dpoEmail: string | null;
  dpoPhone: string | null;
  forumCityState: string | null;
  policyVersion: string | null;
  termsVersion: string | null;
  missingRequiredFields: MissingLegalField[];
};

function readPublicEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function isProductionEnvironment(): boolean {
  // NODE_ENV=production no build de produção Next; NEXT_PUBLIC_APP_ENV permite override explícito.
  const nextPublicAppEnv = process.env.NEXT_PUBLIC_APP_ENV?.trim().toLowerCase();
  if (nextPublicAppEnv) {
    return nextPublicAppEnv === 'production';
  }
  return process.env.NODE_ENV === 'production';
}

export function getPublicLegalConfig(): PublicLegalConfig {
  const companyName = readPublicEnv('NEXT_PUBLIC_LEGAL_COMPANY_NAME');
  const companyDocument = readPublicEnv('NEXT_PUBLIC_LEGAL_COMPANY_DOCUMENT');
  const companyAddress = readPublicEnv('NEXT_PUBLIC_LEGAL_COMPANY_ADDRESS');
  const privacyEmail = readPublicEnv('NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL');
  const explicitSupportEmail = readPublicEnv('NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL');
  const legacyContactEmail = readPublicEnv('NEXT_PUBLIC_LEGAL_CONTACT_EMAIL');
  const supportEmail = explicitSupportEmail || legacyContactEmail || privacyEmail;
  const contactEmail = legacyContactEmail || explicitSupportEmail || privacyEmail;
  const dpoName = readPublicEnv('NEXT_PUBLIC_LEGAL_DPO_NAME');
  const dpoEmail = readPublicEnv('NEXT_PUBLIC_LEGAL_DPO_EMAIL');
  const dpoPhone = readPublicEnv('NEXT_PUBLIC_LEGAL_DPO_PHONE');
  const forumCityState = readPublicEnv('NEXT_PUBLIC_LEGAL_FORUM_CITY_STATE');
  const policyVersion = readPublicEnv('NEXT_PUBLIC_LEGAL_POLICY_VERSION');
  const termsVersion = readPublicEnv('NEXT_PUBLIC_LEGAL_TERMS_VERSION');

  const requiredFields: Array<MissingLegalField & { isMissing: boolean }> = [
    {
      envName: 'NEXT_PUBLIC_LEGAL_COMPANY_NAME',
      label: 'razao social do controlador',
      isMissing: !companyName,
    },
    {
      envName: 'NEXT_PUBLIC_LEGAL_COMPANY_DOCUMENT',
      label: 'CPF/CNPJ do controlador',
      isMissing: !companyDocument,
    },
    {
      envName: 'NEXT_PUBLIC_LEGAL_COMPANY_ADDRESS',
      label: 'endereco do controlador',
      isMissing: !companyAddress,
    },
    {
      envName: 'NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL',
      label: 'canal de privacidade/LGPD',
      isMissing: !privacyEmail,
    },
    {
      envName: 'NEXT_PUBLIC_LEGAL_SUPPORT_EMAIL',
      label: 'canal oficial de suporte',
      isMissing: !explicitSupportEmail && !legacyContactEmail,
    },
    {
      envName: 'NEXT_PUBLIC_LEGAL_FORUM_CITY_STATE',
      label: 'foro contratual',
      isMissing: !forumCityState,
    },
    {
      envName: 'NEXT_PUBLIC_LEGAL_DPO_NAME',
      label: 'nome do encarregado (DPO)',
      isMissing: !dpoName,
    },
    {
      envName: 'NEXT_PUBLIC_LEGAL_DPO_EMAIL',
      label: 'e-mail dedicado do encarregado (DPO)',
      isMissing: !dpoEmail,
    },
    {
      envName: 'NEXT_PUBLIC_LEGAL_POLICY_VERSION',
      label: 'versao publicada da Politica de Privacidade',
      isMissing: !policyVersion,
    },
    {
      envName: 'NEXT_PUBLIC_LEGAL_TERMS_VERSION',
      label: 'versao publicada dos Termos de Uso',
      isMissing: !termsVersion,
    },
  ];

  const missingRequiredFields = requiredFields
    .filter((field) => field.isMissing)
    .map(({ envName, label }) => ({ envName, label }));

  // Fail-fast: em produção, páginas jurídicas não podem renderizar sem identidade institucional completa.
  // Este erro é capturado no boot do SSR e impede deploy silencioso com política incompleta.
  if (isProductionEnvironment() && missingRequiredFields.length > 0) {
    const missingList = missingRequiredFields
      .map((field) => `${field.envName} (${field.label})`)
      .join(', ');
    throw new Error(
      `LGPD/Legal config inválida em produção: variáveis obrigatórias ausentes: ${missingList}. ` +
        'Defina todas as NEXT_PUBLIC_LEGAL_* no ambiente antes do deploy. ' +
        'Publicar política/termos sem identificação do controlador e do DPO viola o dever de transparência (LGPD Art. 9º).',
    );
  }

  return {
    companyName,
    companyDocument,
    companyAddress,
    privacyEmail,
    supportEmail,
    contactEmail,
    dpoName,
    dpoEmail,
    dpoPhone,
    forumCityState,
    policyVersion,
    termsVersion,
    missingRequiredFields,
  };
}
