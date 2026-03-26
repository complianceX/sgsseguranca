type MissingLegalField = {
  envName: string;
  label: string;
};

export type PublicLegalConfig = {
  companyName: string | null;
  companyDocument: string | null;
  companyAddress: string | null;
  privacyEmail: string | null;
  contactEmail: string | null;
  dpoName: string | null;
  forumCityState: string | null;
  missingRequiredFields: MissingLegalField[];
};

function readPublicEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getPublicLegalConfig(): PublicLegalConfig {
  const companyName = readPublicEnv('NEXT_PUBLIC_LEGAL_COMPANY_NAME');
  const companyDocument = readPublicEnv('NEXT_PUBLIC_LEGAL_COMPANY_DOCUMENT');
  const companyAddress = readPublicEnv('NEXT_PUBLIC_LEGAL_COMPANY_ADDRESS');
  const privacyEmail = readPublicEnv('NEXT_PUBLIC_LEGAL_PRIVACY_EMAIL');
  const contactEmail =
    readPublicEnv('NEXT_PUBLIC_LEGAL_CONTACT_EMAIL') || privacyEmail;
  const dpoName = readPublicEnv('NEXT_PUBLIC_LEGAL_DPO_NAME');
  const forumCityState = readPublicEnv('NEXT_PUBLIC_LEGAL_FORUM_CITY_STATE');

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
      envName: 'NEXT_PUBLIC_LEGAL_FORUM_CITY_STATE',
      label: 'foro contratual',
      isMissing: !forumCityState,
    },
  ];

  return {
    companyName,
    companyDocument,
    companyAddress,
    privacyEmail,
    contactEmail,
    dpoName,
    forumCityState,
    missingRequiredFields: requiredFields
      .filter((field) => field.isMissing)
      .map(({ envName, label }) => ({ envName, label })),
  };
}
