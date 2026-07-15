import { fireEvent, render, screen } from '@testing-library/react';
import { OfflineCapabilityBanner } from './OfflineCapabilityBanner';

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

describe('OfflineCapabilityBanner', () => {
  beforeEach(() => setOnline(true));

  it('is hidden online', () => {
    render(<OfflineCapabilityBanner pathname="/dashboard/dds" />);
    expect(screen.queryByText('Modo offline')).not.toBeInTheDocument();
  });

  it('announces the capability without blocking reading', () => {
    setOnline(false);
    render(<OfflineCapabilityBanner pathname="/dashboard/arrs" />);

    const banner = screen.getByRole('status');
    expect(banner).toHaveAttribute('aria-live', 'polite');
    expect(banner).toHaveAttribute('data-offline-capability', 'read-only');
    expect(banner).toHaveTextContent('continuam disponíveis para consulta');
  });

  it('blocks an online-only form before its submit handler runs', () => {
    setOnline(false);
    const onSubmit = jest.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <>
        <OfflineCapabilityBanner pathname="/dashboard/trainings" />
        <form onSubmit={onSubmit}>
          <button type="submit">Gerar treinamento</button>
        </form>
      </>,
    );

    fireEvent.submit(screen.getByRole('button', { name: 'Gerar treinamento' }).closest('form')!);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Reconecte-se antes de iniciar esta operação',
    );
  });

  it('allows queued forms in a read-write module', () => {
    setOnline(false);
    const onSubmit = jest.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <>
        <OfflineCapabilityBanner pathname="/dashboard/aprs/new" />
        <form onSubmit={onSubmit}>
          <button type="submit">Salvar APR</button>
        </form>
      </>,
    );

    fireEvent.submit(screen.getByRole('button', { name: 'Salvar APR' }).closest('form')!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('reacts when connectivity changes', () => {
    setOnline(false);
    render(<OfflineCapabilityBanner pathname="/dashboard/sites" />);
    expect(screen.getByText('Modo offline')).toBeInTheDocument();

    setOnline(true);
    fireEvent(window, new Event('online'));
    expect(screen.queryByText('Modo offline')).not.toBeInTheDocument();
  });

  it.each([
    ['/dashboard/relatorios/rdos', 'Salvar RDO'],
    ['/dashboard/relatorios/rdos', 'Excluir RDO'],
    ['/dashboard/medical-exams', 'Excluir exame'],
  ])('blocks priority mutation %s / %s without a form', (pathname, label) => {
    setOnline(false);
    const mutate = jest.fn();
    render(
      <>
        <OfflineCapabilityBanner pathname={pathname} />
        <button type="button" onClick={mutate}>{label}</button>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(mutate).not.toHaveBeenCalled();
  });

  it('allows navigation, reading and pure UI actions', () => {
    setOnline(false);
    const read = jest.fn();
    const ui = jest.fn();
    render(
      <>
        <OfflineCapabilityBanner pathname="/dashboard/medical-exams" />
        <button type="button" data-offline-action="read" onClick={read}>Visualizar exame</button>
        <button type="button" aria-expanded="false" onClick={ui}>Abrir filtros</button>
        <a href="/dashboard/medical-exams/1">Detalhes</a>
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Visualizar exame' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir filtros' }));
    expect(read).toHaveBeenCalledTimes(1);
    expect(ui).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Detalhes' })).toHaveAttribute('href', '/dashboard/medical-exams/1');
  });
});
