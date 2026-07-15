import { render, screen } from '@testing-library/react';
import { Table, TableBody, TableCell, TableRow } from './table';

describe('Table', () => {
  it('preserva a semântica nativa de tabela por padrão', () => {
    render(
      <Table label="Pessoas">
        <TableBody>
          <TableRow>
            <TableCell>Ana</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    const table = screen.getByRole('table', { name: 'Pessoas' });
    expect(table).not.toHaveAttribute('role');
  });

  it('aceita grid somente quando o consumidor informa o papel explicitamente', () => {
    render(<Table role="grid" label="Dados editáveis" />);

    expect(screen.getByRole('grid', { name: 'Dados editáveis' })).toHaveAttribute(
      'role',
      'grid',
    );
  });
});
