import * as jwt from 'jsonwebtoken';

export type ValidationTokenPayload = {
  jti: string;
  code: string;
  companyId: string;
  portal: string;
};

const getSecret = (): string => {
  const secret = process.env.VALIDATION_TOKEN_SECRET?.trim();
  if (!secret) {
    throw new Error('VALIDATION_TOKEN_SECRET não configurado');
  }
  return secret;
};

export const signValidationToken = (
  payload: ValidationTokenPayload,
  options?: { expiresIn?: string | number },
): string => {
  const expiresIn = (options?.expiresIn ??
    '7d') as jwt.SignOptions['expiresIn'];

  return jwt.sign(payload, getSecret(), {
    algorithm: 'HS256',
    expiresIn,
  });
};

export const verifyValidationToken = (
  token: string,
): ValidationTokenPayload => {
  const decoded = jwt.verify(token, getSecret(), {
    algorithms: ['HS256'],
  }) as jwt.JwtPayload;

  const jti = String(decoded.jti || '').trim();
  const code = String(decoded.code || '').trim();
  const companyId = String(decoded.companyId || '').trim();
  const portal = String(decoded.portal || '').trim();

  if (!jti || !code || !companyId || !portal) {
    throw new Error('payload inválido no validation token');
  }

  return { jti, code, companyId, portal };
};
