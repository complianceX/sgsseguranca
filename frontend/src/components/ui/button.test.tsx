import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('renderiza com texto', () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });

  it('renderiza com variante primary por padrao', () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-[var(--component-button-primary-bg)]');
  });

  it('renderiza com variante secondary', () => {
    render(<Button variant="secondary">Cancelar</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-[var(--component-button-secondary-bg)]');
  });

  it('renderiza com variante ghost', () => {
    render(<Button variant="ghost">Voltar</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-transparent');
  });

  it('renderiza com variante destructive', () => {
    render(<Button variant="destructive">Excluir</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-[var(--component-button-danger-bg)]');
  });

  it('renderiza com tamanho sm', () => {
    render(<Button size="sm">Pequeno</Button>);
    expect(screen.getByRole('button')).toHaveClass('h-8');
  });

  it('renderiza com tamanho lg', () => {
    render(<Button size="lg">Grande</Button>);
    expect(screen.getByRole('button')).toHaveClass('h-10');
  });

  it('renderiza desabilitado', () => {
    render(<Button disabled>Salvar</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renderiza com loading e mostra spinner', () => {
    render(<Button loading>Salvar</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('renderiza icone a esquerda', () => {
    render(<Button leftIcon={<span data-testid="icon-left">*</span>}>Salvar</Button>);
    expect(screen.getByTestId('icon-left')).toBeInTheDocument();
  });

  it('renderiza icone a direita', () => {
    render(<Button rightIcon={<span data-testid="icon-right">*</span>}>Salvar</Button>);
    expect(screen.getByTestId('icon-right')).toBeInTheDocument();
  });

  it('nao renderiza icone quando loading', () => {
    render(
      <Button loading leftIcon={<span data-testid="icon-left">*</span>}>
        Salvar
      </Button>,
    );
    expect(screen.queryByTestId('icon-left')).not.toBeInTheDocument();
  });

  it('executa onClick', () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Salvar</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('nao executa onClick quando desabilitado', () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick} disabled>Salvar</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renderiza como link', () => {
    render(<Button variant="link">Link</Button>);
    expect(screen.getByRole('button')).toHaveClass('!h-auto');
  });

  it('aplica className extra', () => {
    render(<Button className="extra-class">Salvar</Button>);
    expect(screen.getByRole('button')).toHaveClass('extra-class');
  });
});
