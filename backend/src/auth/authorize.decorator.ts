import { applyDecorators, UseGuards } from '@nestjs/common';
import { Permissions } from './permissions.decorator';
import { PermissionsGuard } from './permissions.guard';

export const Authorize = (...permissions: string[]) =>
  applyDecorators(Permissions(...permissions), UseGuards(PermissionsGuard));

export const authorize = Authorize;
