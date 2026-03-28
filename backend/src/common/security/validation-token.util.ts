import * as jwt from 'jsonwebtoken';

type ValidationTokenPayload = {
  code: string;
  companyId: string;
};

const getSecret = (): string => {
  const secret = process.env.VALIDATION_TOKEN_SECRET?.trim();
  if (!secret) {
    throw new Error('VALIDATION_TOKEN_SECRET não configurado');
  }
  return secret;
};

export const signValidationToken = (payload: ValidationTokenPayload): string =>
  jwt.sign(payload, getSecret(), {
    algorithm: 'HS256',
    expiresIn: '365d', // validade longa; renovar se necessário
  });

export const verifyValidationToken = (
  token: string,
): ValidationTokenPayload => {
  const decoded = jwt.verify(token, getSecret(), {
    algorithms: ['HS256'],
  }) as jwt.JwtPayload;

  const code = String(decoded.code || '').trim();
  const companyId = String(decoded.companyId || '').trim();

  if (!code || !companyId) {
    throw new Error('payload inválido no validation token');
  }

  return { code, companyId };
};
