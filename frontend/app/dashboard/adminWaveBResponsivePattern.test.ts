import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pages = [
  'cats/page.tsx',
  'corrective-actions/page.tsx',
  'trainings/page.tsx',
  'medical-exams/page.tsx',
  'epi-fichas/page.tsx',
];

describe('administrative wave B responsive and accessible pattern', () => {
  it.each(pages)('%s uses one responsive desktop-table/mobile-card list', (relativePath) => {
    const source = readFileSync(join(__dirname, relativePath), 'utf8');

    expect(source).toContain('ResponsiveDataList');
    expect(source).toContain('mobileClassName="space-y-3 p-3"');
    expect(source).toContain('<article');
    expect(source).toContain('<Table>');
  });

  it.each(['cats/page.tsx', 'trainings/page.tsx', 'medical-exams/page.tsx', 'epi-fichas/page.tsx'])(
    '%s does not use blocking browser prompt/confirm dialogs',
    (relativePath) => {
      const source = readFileSync(join(__dirname, relativePath), 'utf8');
      expect(source).not.toContain('window.prompt(');
      expect(source).not.toContain('window.confirm(');
      expect(source).not.toContain('if (!confirm(');
      expect(source).toMatch(/ModalFrame|ConfirmModal/);
    },
  );
});
