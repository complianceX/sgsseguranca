import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CalendarPage from './page';
import { calendarService } from '@/services/calendarService';

jest.mock('sonner', () => ({ toast: { error: jest.fn() } }));
jest.mock('@/services/calendarService', () => {
  const actual = jest.requireActual('@/services/calendarService');
  return {
    ...actual,
    calendarService: { getEvents: jest.fn() },
  };
});

const mockedGetEvents = calendarService.getEvents as jest.MockedFunction<
  typeof calendarService.getEvents
>;

describe('CalendarPage accessibility', () => {
  beforeEach(() => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
    mockedGetEvents.mockResolvedValue({
      data: [{ id: 'event-1', type: 'dds', title: 'DDS acessível', date }],
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    });
  });

  afterEach(() => jest.clearAllMocks());

  it('expõe navegação nomeada, agenda padrão e grade operável por teclado', async () => {
    render(<CalendarPage />);

    expect(screen.getByRole('button', { name: 'Mês anterior' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próximo mês' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agenda' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await waitFor(() => expect(screen.getAllByText('DDS acessível').length).toBeGreaterThan(0));

    const viewToggle = screen.getByRole('group', { name: 'Visualização do calendário' });
    expect(viewToggle).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Grade' }));
    const day = screen.getByRole('button', { name: /15 de .*1 evento/ });
    day.focus();
    expect(day).toHaveFocus();
    // Click is the activation event emitted by Enter/Espaço for a native button.
    fireEvent.click(day, { detail: 0 });
    expect(day).toHaveAttribute('aria-pressed', 'true');
  });
});
