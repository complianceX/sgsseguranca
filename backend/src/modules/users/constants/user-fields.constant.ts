export const USER_BASE_FIELDS = [
  'id',
  'nome',
  'cpf',
  'email',
  'funcao',
  'company_id',
  'site_id',
  'profile_id',
  'status',
  'created_at',
  'updated_at',
] as const;

export const USER_WITH_PASSWORD_FIELDS = [
  ...USER_BASE_FIELDS,
  'auth_user_id',
  'password',
] as const;

export const USER_PUBLIC_FIELDS = ['id', 'nome', 'funcao', 'status'] as const;
