import { Request } from 'express';

export interface RequestWithUser extends Request {
  user: {
    userId: string;
    company_id?: string;
    profile?: {
      nome: string;
    };
    [key: string]: any;
  };
}
