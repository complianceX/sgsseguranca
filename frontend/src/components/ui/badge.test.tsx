import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

describe('Badge', () => {
  it('renderiza com texto', () => {
    render(<Badge>Ativo</Badge>);
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('renderiza com variante neutral por padrao', () => {
    render(<Badge>Neutro</Badge>);
    expect(screen.getByText('Neutro')).toHaveClass('border-[color:var(--component-badge-neutral-border)]');
  });

  it('renderiza com variante success', () => {
    render(<Badge variant="success">Concluido</Badge>);
    expect(screen.getByText('Concluido')).toHaveClass('border-[var(--ds-color-success-border)]');
  });

  it('renderiza com variante warning', () => {
    render(<Badge variant="warning">Pendente</Badge>);
    expect(screen.getByText('Pendente')).toHaveClass('border-[var(--ds-color-warning-border)]');
  });

  it('renderiza com variante danger', () => {
    render(<Badge variant="danger">Critico</Badge>);
    expect(screen.getByText('Critico')).toHaveClass('border-[var(--ds-color-danger-border)]');
  });

  it('renderiza com variante info', () => {
    render(<Badge variant="info">Info</Badge>);
    expect(screen.getByText('Info')).toHaveClass('border-[var(--ds-color-info-border)]');
  });

  it('renderiza com variante primary', () => {
    render(<Badge variant="primary">Primario</Badge>);
    expect(screen.getByText('Primario')).toHaveClass('border-[color:var(--component-badge-primary-border)]');
  });

  it('renderiza icone semantico quando showIcon=true e variante definida', () => {
    const { container } = render(<Badge variant="success" showIcon>Concluido</Badge>);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('nao renderiza icone quando showIcon=false', () => {
    const { container } = render(<Badge variant="success">Concluido</Badge>);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
  });

  it('nao renderiza icone quando variante nao tem icone mapeado', () => {
    const { container } = render(<Badge variant="neutral" showIcon>Neutro</Badge>);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
  });

  it('aplica className extra', () => {
    render(<Badge className="extra-classe">Tag</Badge>);
    expect(screen.getByText('Tag')).toHaveClass('extra-classe');
  });
});
