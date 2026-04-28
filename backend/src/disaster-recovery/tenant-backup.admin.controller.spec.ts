import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { SENSITIVE_ACTION_KEY } from '../common/security/sensitive-action.guard';
import { TenantBackupAdminController } from './tenant-backup.admin.controller';

type TenantBackupAdminControllerPrivate = {
  assertUploadedBackupFile(
    file: Express.Multer.File | undefined,
  ): Promise<void>;
};

function getControllerHandler(
  method: keyof TenantBackupAdminController,
): (...args: never[]) => unknown {
  const descriptor = Object.getOwnPropertyDescriptor(
    TenantBackupAdminController.prototype,
    method,
  );
  return descriptor?.value as (...args: never[]) => unknown;
}

describe('TenantBackupAdminController hardening', () => {
  const reflector = new Reflector();

  it('exige permissão explícita e step-up nos comandos manuais de DR', () => {
    const backupHandler = getControllerHandler('triggerTenantBackup');
    const restoreHandler = getControllerHandler('restoreTenantBackup');

    expect(reflector.get<string[]>(PERMISSIONS_KEY, backupHandler)).toEqual([
      'can_manage_disaster_recovery',
    ]);
    expect(reflector.get<string[]>(PERMISSIONS_KEY, restoreHandler)).toEqual([
      'can_manage_disaster_recovery',
    ]);
    expect(reflector.get<string>(SENSITIVE_ACTION_KEY, backupHandler)).toBe(
      'tenant_backup',
    );
    expect(reflector.get<string>(SENSITIVE_ACTION_KEY, restoreHandler)).toBe(
      'tenant_restore',
    );
  });

  it('exige permissão explícita para listagem/status de backups', () => {
    const listHandler = getControllerHandler('listTenantBackups');
    const statusHandler = getControllerHandler('getTenantBackupJobStatus');

    expect(reflector.get<string[]>(PERMISSIONS_KEY, listHandler)).toEqual([
      'can_manage_disaster_recovery',
    ]);
    expect(reflector.get<string[]>(PERMISSIONS_KEY, statusHandler)).toEqual([
      'can_manage_disaster_recovery',
    ]);
  });

  it('aceita somente arquivo .json.gz com assinatura gzip para restore por upload', async () => {
    const controller = new TenantBackupAdminController(
      {} as ConstructorParameters<typeof TenantBackupAdminController>[0],
      {} as ConstructorParameters<typeof TenantBackupAdminController>[1],
    ) as unknown as TenantBackupAdminControllerPrivate;
    const filePath = path.join(tmpdir(), `${randomUUID()}.json.gz`);
    await fs.writeFile(filePath, Buffer.from([0x1f, 0x8b, 0x08, 0x00]));

    await expect(
      controller.assertUploadedBackupFile({
        path: filePath,
        originalname: 'tenant-backup.json.gz',
      } as Express.Multer.File),
    ).resolves.toBeUndefined();

    await fs.unlink(filePath).catch(() => undefined);
  });

  it('bloqueia upload de restore sem assinatura gzip', async () => {
    const controller = new TenantBackupAdminController(
      {} as ConstructorParameters<typeof TenantBackupAdminController>[0],
      {} as ConstructorParameters<typeof TenantBackupAdminController>[1],
    ) as unknown as TenantBackupAdminControllerPrivate;
    const filePath = path.join(tmpdir(), `${randomUUID()}.json.gz`);
    await fs.writeFile(filePath, Buffer.from('not gzip', 'utf8'));

    await expect(
      controller.assertUploadedBackupFile({
        path: filePath,
        originalname: 'tenant-backup.json.gz',
      } as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);

    await fs.unlink(filePath).catch(() => undefined);
  });
});
