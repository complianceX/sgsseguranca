import { ChecklistsModule } from './checklists.module';

describe('ChecklistsModule wiring', () => {
  it('does not depend on DocumentImportModule directly', () => {
    const imports = Reflect.getMetadata('imports', ChecklistsModule) ?? [];

    const importNames = imports
      .map((moduleRef: { name?: string }) => moduleRef?.name)
      .filter(Boolean);

    expect(importNames).not.toContain('DocumentImportModule');
  });
});
