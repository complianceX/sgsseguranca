import { Request } from 'express';

export interface RequestWithUser extends Request {
  user: {
    id?: string;
    userId: string;
    app_user_id?: string;
    auth_user_id?: string;
    authUserId?: string;
    company_id?: string;
    companyId?: string;
    cpf?: string;
    profile?: {
      nome: string;
    };
    isSuperAdmin?: boolean;
    plan?: string;
    [key: string]: unknown;
  };
}
