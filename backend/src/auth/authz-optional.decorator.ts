import { SetMetadata } from '@nestjs/common';

export const AUTHZ_OPTIONAL_KEY = 'authz_optional';

/**
 * Marca rotas autenticadas de self-service que podem existir sem RBAC fino.
 * O uso deve ser raro e sempre intencional.
 */
export const AuthzOptional = () => SetMetadata(AUTHZ_OPTIONAL_KEY, true);
