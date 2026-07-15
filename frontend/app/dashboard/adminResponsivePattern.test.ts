import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('administrative catalogs on small screens', () => {
  const implementations = [
    'companies/page.tsx',
    'sites/page.tsx',
    'users/components/UsersTable.tsx',
    'employees/page.tsx',
    'audits/page.tsx',
  ];

  it.each(implementations)('%s mantém tabela desktop e oferece cards mobile sem árvore duplicada', (relativePath) => {
    const source = readFileSync(join(__dirname, relativePath), 'utf8');

    expect(source).toContain('ResponsiveDataList');
    expect(source).toContain('CatalogMobileCard');
    expect(source).toContain('mobileClassName="grid min-w-0');
    expect(source).toContain('<Table>');
    expect(source).toContain('min-h-11');
  });

  it('usa ModalFrame no QR Code de obras', () => {
    const source = readFileSync(join(__dirname, 'sites/page.tsx'), 'utf8');

    expect(source).toContain('<ModalFrame');
    expect(source).toContain('title="QR Code da obra"');
    expect(source).not.toContain('fixed inset-0 z-50');
  });
});
