import { render, screen, fireEvent } from "@/$(Match.1)esting-library/react';
import { Input } from './input';

describe('Input', () => {
  it('renderiza input basico', () => {
    render(<Input placeholder="Digite seu nome" />);
    expect(screen.getByPlaceholderText('Digite seu nome')).toBeInTheDocument();
  });

  it('renderiza com type padrao text', () => {
    render(<Input data-testid="input" />);
    expect(screen.getByTestId('input')).toHaveAttribute('type', 'text');
  });

  it('renderiza com type personalizado', () => {
    render(<Input type="email" data-testid="input" />);
    expect(screen.getByTestId('input')).toHaveAttribute('type', 'email');
  });

  it('aplica tone default', () => {
    render(<Input data-testid="input" />);
    expect(screen.getByTestId('input')).toHaveClass('border-[var(--component-field-border)]');
  });

  it('aplica tone subtle', () => {
    render(<Input tone="subtle" data-testid="input" />);
    expect(screen.getByTestId('input')).toHaveClass('border-[var(--component-field-border-subtle)]');
  });

  it('renderiza com valor', () => {
    render(<Input value="teste" onChange={() => {}} data-testid="input" />);
    expect(screen.getByTestId('input')).toHaveValue('teste');
  });

  it('renderiza desabilitado', () => {
    render(<Input disabled data-testid="input" />);
    expect(screen.getByTestId('input')).toBeDisabled();
  });

  it('renderiza com required', () => {
    render(<Input required data-testid="input" />);
    expect(screen.getByTestId('input')).toBeRequired();
  });

  it('aplica className extra', () => {
    render(<Input className="extra-classe" data-testid="input" />);
    expect(screen.getByTestId('input')).toHaveClass('extra-classe');
  });

  it('chama onChange ao digitar', () => {
    const onChange = jest.fn();
    render(<Input onChange={onChange} data-testid="input" />);
    fireEvent.change(screen.getByTestId('input'), { target: { value: 'novo valor' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('renderiza com maxLength', () => {
    render(<Input maxLength={10} data-testid="input" />);
    expect(screen.getByTestId('input')).toHaveAttribute('maxlength', '10');
  });
});
