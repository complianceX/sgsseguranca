import { render, screen } from '@testing-library/react';
import { MobileActionBar } from './mobile-action-bar';

describe('MobileActionBar', () => {
  it('exposes a labelled action group without claiming incomplete toolbar semantics', () => {
    render(
      <MobileActionBar>
        <button type="button">Cancelar</button>
        <button type="submit">Salvar</button>
      </MobileActionBar>,
    );

    const group = screen.getByRole('group', { name: 'Ações do formulário' });
    expect(group).toHaveClass('ds-mobile-action-bar');
    expect(group).toHaveAttribute('data-sophie-reserved-zone', 'bottom');
    expect(group).not.toHaveAttribute('aria-orientation');
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });

  it('supports a contextual label and keeps responsive classes at 320px', () => {
    window.innerWidth = 320;

    render(
      <MobileActionBar aria-label="Ações da APR" className="apr-actions" data-testid="bar">
        <button type="button">Avançar</button>
      </MobileActionBar>,
    );

    const group = screen.getByRole('group', { name: 'Ações da APR' });
    expect(group).toHaveClass('ds-mobile-action-bar', 'apr-actions');
    expect(group).toHaveAttribute('data-testid', 'bar');
    expect(group.className).not.toMatch(/min-w-|w-\[/);
  });
});
