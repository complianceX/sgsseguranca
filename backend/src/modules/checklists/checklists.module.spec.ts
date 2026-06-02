import { ChecklistsModule } from './checklists.module';

type ModuleLike = {
  name?: string;
};

const isModuleLike = (value: unknown): value is ModuleLike =>
  typeof value === 'function' ||
  (typeof value === 'object' && value !== null && 'name' in value);

describe('ChecklistsModule wiring', () => {
  it('does not depend on DocumentImportModule directly', () => {
    const metadata: unknown = Reflect.getMetadata('imports', ChecklistsModule);
    const imports = Array.isArray(metadata) ? metadata : [];

    const importNames = imports
      .filter(isModuleLike)
      .map((moduleRef) => moduleRef.name)
      .filter((name): name is string => typeof name === 'string');

    expect(importNames).not.toContain('DocumentImportModule');
    expect(importNames).toContain('FileParserModule');
  });
});
