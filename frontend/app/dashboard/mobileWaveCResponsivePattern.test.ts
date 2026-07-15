import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('segunda onda C de listas mobile', () => {
  const responsiveLists = [
    'expenses/page.tsx',
    'expenses/[id]/page.tsx',
    'nonconformities/page.tsx',
    'service-orders/page.tsx',
    'document-pendencies/page.tsx',
    'checklist-models/components/ChecklistModelsView.tsx',
  ];

  it.each(responsiveLists)('%s mantém tabela desktop e cards mobile em uma única árvore', (relativePath) => {
    const source = readFileSync(join(__dirname, relativePath), 'utf8');

    expect(source).toContain('ResponsiveDataList');
    expect(source).toContain('mobileClassName=');
    expect(source).toContain('<Table');
    expect(source).toMatch(/min-h-11|size="icon"/);
  });

  it.each([
    ['checklist-templates/page.tsx', '/dashboard/checklist-models'],
    ['checklist-templates/new/page.tsx', '/dashboard/checklist-models/new'],
  ])('%s preserva o alias para o destino responsivo', (relativePath, destination) => {
    const source = readFileSync(join(__dirname, relativePath), 'utf8');
    expect(source).toContain(`redirect("${destination}")`);
  });
});
