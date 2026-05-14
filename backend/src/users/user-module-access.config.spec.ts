import {
  normalizeUserModuleAccessKeys,
  resolvePermissionsFromModuleKeys,
} from './user-module-access.config';

describe('user-module-access.config', () => {
  it('normaliza chaves de módulos removendo duplicados e valores inválidos', () => {
    expect(
      normalizeUserModuleAccessKeys([
        'trainings',
        'trainings',
        'module-invalido',
        '',
        'aprs',
      ]),
    ).toEqual(['trainings', 'aprs']);
  });

  it('traduz chaves de módulos para permissions efetivas', () => {
    expect(resolvePermissionsFromModuleKeys(['trainings', 'aprs'])).toEqual(
      expect.arrayContaining([
        'can_view_trainings',
        'can_manage_trainings',
        'can_create_apr',
        'can_import_apr_pdf',
      ]),
    );
  });
});
