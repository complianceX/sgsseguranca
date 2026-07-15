import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('catalog mobile list pattern', () => {
  const implementations = [
    'activities/page.tsx',
    'risks/components/RisksTable.tsx',
    'epis/page.tsx',
    'tools/page.tsx',
    'machines/page.tsx',
  ];

  it.each(implementations)('%s usa uma única lista responsiva e o card compartilhado', (relativePath) => {
    const source = readFileSync(join(__dirname, relativePath), 'utf8');

    expect(source).toContain('ResponsiveDataList');
    expect(source).toContain('CatalogMobileCard');
    expect(source).toContain('mobileClassName="grid min-w-0');
    expect(source).toContain('<Table>');
  });
});
