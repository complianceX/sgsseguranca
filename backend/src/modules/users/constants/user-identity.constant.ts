export const UserIdentityType = {
  SYSTEM_USER: 'system_user',
  EMPLOYEE_SIGNER: 'employee_signer',
} as const;

export type UserIdentityType =
  (typeof UserIdentityType)[keyof typeof UserIdentityType];

export const USER_IDENTITY_TYPES = Object.values(UserIdentityType);

export const UserAccessStatus = {
  CREDENTIALED: 'credentialed',
  NO_LOGIN: 'no_login',
  MISSING_CREDENTIALS: 'missing_credentials',
} as const;

export type UserAccessStatus =
  (typeof UserAccessStatus)[keyof typeof UserAccessStatus];

export const USER_ACCESS_STATUSES = Object.values(UserAccessStatus);
