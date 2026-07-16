import { render, screen } from '@testing-library/react';
import { MetricCard } from './metric-card';

describe('MetricCard', () => {
  it('renderiza label e valor', () => {
    render(<MetricCard label="Total" value={42} />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renderiza nota quando fornecida', () => {
    render(<MetricCard label="Total" value={42} note="vs. mes anterior" />);
    expect(screen.getByText('vs. mes anterior')).toBeInTheDocument();
  });

  it('nao renderiza nota quando ausente', () => {
    const { container } = render(<MetricCard label="Total" value={42} />);
    expect(container.querySelectorAll('p').length).toBe(1);
  });

  it('usa tone neutral por padrao', () => {
    render(<MetricCard label="Total" value={42} />);
    expect(screen.getByText('Total')).toHaveClass('text-[var(--ds-color-text-secondary)]');
  });

  it('aplica tone primary', () => {
    render(<MetricCard label="Status" value="Ativo" tone="primary" />);
    expect(screen.getByText('Status')).toHaveClass('text-[var(--ds-color-action-primary)]');
  });

  it('aplica tone success', () => {
    render(<MetricCard label="Equipe" value={5} tone="success" />);
    expect(screen.getByText('Equipe')).toHaveClass('text-[var(--ds-color-success-fg)]');
  });

  it('aplica tone warning', () => {
    render(<MetricCard label="Risco" value="Alto" tone="warning" />);
    expect(screen.getByText('Risco')).toHaveClass('text-[var(--ds-color-warning-fg)]');
  });

  it('aplica tone danger', () => {
    render(<MetricCard label="Criticos" value={3} tone="danger" />);
    expect(screen.getByText('Criticos')).toHaveClass('text-[var(--ds-color-danger-fg)]');
  });

  it('aplica tone info', () => {
    render(<MetricCard label="Turno" value="Manha" tone="info" />);
    expect(screen.getByText('Turno')).toHaveClass('text-[var(--ds-color-info-fg)]');
  });

  it('aplica className extra', () => {
    const { container } = render(
      <MetricCard label="Total" value={42} className="extra-classe" />,
    );
    expect(container.firstChild).toHaveClass('extra-classe');
  });

  it('aplica tone orange', () => {
    render(<MetricCard label="Substancial" value={2} tone="orange" />);
    expect(screen.getByText('Substancial')).toHaveClass('text-[var(--ds-color-elevated-fg)]');
  });

  it('aplica tone muted', () => {
    render(<MetricCard label="Incompletas" value={1} tone="muted" />);
    expect(screen.getByText('Incompletas')).toHaveClass('text-[var(--apr-incomplete-fg)]');
  });

  describe('delta', () => {
    it('formata alta como "vs. periodo anterior"', () => {
      render(<MetricCard label="Total" value={5} delta={{ value: 3 }} />);
      expect(screen.getByText('↑ 3 vs. período anterior')).toBeInTheDocument();
    });

    it('formata baixa com valor absoluto', () => {
      render(<MetricCard label="Total" value={5} delta={{ value: -2 }} />);
      expect(screen.getByText('↓ 2 vs. período anterior')).toBeInTheDocument();
    });

    it('formata zero como sem alteracao', () => {
      render(<MetricCard label="Total" value={5} delta={{ value: 0 }} />);
      expect(screen.getByText('= sem alteração')).toBeInTheDocument();
    });

    it('aceita formatter customizado', () => {
      render(
        <MetricCard
          label="Total"
          value={5}
          delta={{ value: 3, format: (d) => `+${d} novos` }}
        />,
      );
      expect(screen.getByText('+3 novos')).toBeInTheDocument();
    });

    it('note explicito tem precedencia sobre delta', () => {
      render(
        <MetricCard label="Total" value={5} note="nota manual" delta={{ value: 3 }} />,
      );
      expect(screen.getByText('nota manual')).toBeInTheDocument();
      expect(screen.queryByText('↑ 3 vs. período anterior')).not.toBeInTheDocument();
    });
  });

  describe('density="compact"', () => {
    it('renderiza label e valor sem o indicador de ponto', () => {
      const { container } = render(
        <MetricCard density="compact" label="Total" value={7} />,
      );
      expect(screen.getByText('Total')).toBeInTheDocument();
      expect(screen.getByText('7')).toBeInTheDocument();
      expect(container.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
    });

    it('aplica tone compacto', () => {
      render(<MetricCard density="compact" label="Criticos" value={2} tone="danger" />);
      expect(screen.getByText('Criticos')).toHaveClass('text-[var(--color-danger)]');
    });

    it('renderiza delta como nota', () => {
      render(
        <MetricCard density="compact" label="Total" value={5} delta={{ value: 1 }} />,
      );
      expect(screen.getByText('↑ 1 vs. período anterior')).toBeInTheDocument();
    });
  });

  describe('variant="strip" (modo de compatibilidade do ListPageLayout)', () => {
    it('renderiza a classe base ds-metric-item sem classe de tone para neutral', () => {
      const { container } = render(
        <MetricCard variant="strip" label="Total" value={42} tone="neutral" />,
      );
      expect(container.firstChild).toHaveClass('ds-metric-item');
      expect(container.firstChild).not.toHaveClass('ds-metric-item--neutral');
    });

    it('aplica classe de tone dedicada para primary/success/warning/danger', () => {
      for (const tone of ['primary', 'success', 'warning', 'danger'] as const) {
        const { container, unmount } = render(
          <MetricCard variant="strip" label="Total" value={42} tone={tone} />,
        );
        expect(container.firstChild).toHaveClass(`ds-metric-item--${tone}`);
        unmount();
      }
    });

    it('nao aplica classe de tone para info (sem CSS dedicado no strip)', () => {
      const { container } = render(
        <MetricCard variant="strip" label="Total" value={42} tone="info" />,
      );
      expect(container.firstChild).not.toHaveClass('ds-metric-item--info');
    });

    it('usa as classes __label/__value/__note em vez do estilo de card rico', () => {
      render(<MetricCard variant="strip" label="Total" value={42} note="nota" />);
      expect(screen.getByText('Total')).toHaveClass('ds-metric-item__label');
      expect(screen.getByText('nota')).toHaveClass('ds-metric-item__note');
    });
  });
});
