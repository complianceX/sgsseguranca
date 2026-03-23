'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import Link from 'next/link';
import {
  calendarService,
  CalendarEvent,
  CalendarEventType,
  EVENT_TYPE_LABEL,
  EVENT_TYPE_COLOR,
  EVENT_TYPE_HREF,
} from '@/services/calendarService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const ALL_TYPES: CalendarEventType[] = ['training', 'medical_exam', 'dds', 'rdo', 'cat', 'service_order'];

function buildCalendarGrid(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<CalendarEventType>>(new Set(ALL_TYPES));

  useEffect(() => {
    setLoading(true);
    setSelectedDay(null);
    calendarService
      .getEvents(year, month)
      .then((response) => setEvents(response.data))
      .catch(() => {
        setEvents([]);
        toast.error('Não foi possível carregar os eventos do calendário.');
      })
      .finally(() => setLoading(false));
  }, [year, month]);

  function prevMonth() {
    if (month === 1) {
      setMonth(12);
      setYear((currentYear) => currentYear - 1);
      return;
    }
    setMonth((currentMonth) => currentMonth - 1);
  }

  function nextMonth() {
    if (month === 12) {
      setMonth(1);
      setYear((currentYear) => currentYear + 1);
      return;
    }
    setMonth((currentMonth) => currentMonth + 1);
  }

  function toggleFilter(type: CalendarEventType) {
    setActiveFilters((previous) => {
      const next = new Set(previous);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  const filteredEvents = useMemo(
    () => events.filter((event) => activeFilters.has(event.type)),
    [events, activeFilters],
  );

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const event of filteredEvents) {
      if (!map[event.date]) map[event.date] = [];
      map[event.date].push(event);
    }
    return map;
  }, [filteredEvents]);

  const grid = buildCalendarGrid(year, month);
  const today = formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const selectedDateStr = selectedDay ? formatDate(year, month, selectedDay) : null;
  const selectedEvents = selectedDateStr ? (eventsByDate[selectedDateStr] ?? []) : [];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]">
          <CalendarDays className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--ds-color-text-primary)]">Calendário SST</h1>
          <p className="text-sm text-[var(--ds-color-text-muted)]">Treinamentos, exames, DDS, RDOs, CATs e ordens de serviço</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {ALL_TYPES.map((type) => {
          const color = EVENT_TYPE_COLOR[type];
          const active = activeFilters.has(type);
          return (
            <button
              key={type}
              onClick={() => toggleFilter(type)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                active
                  ? `${color.bg} ${color.text} border-transparent shadow-[var(--ds-shadow-sm)]`
                  : 'border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-base)] text-[var(--ds-color-text-muted)]'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${active ? color.dot : 'bg-[var(--ds-color-border-default)]'}`} />
              {EVENT_TYPE_LABEL[type]}
            </button>
          );
        })}
      </div>

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex items-center justify-between">
            <Button onClick={prevMonth} variant="ghost" size="icon" className="text-[var(--ds-color-text-secondary)]">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-lg font-semibold text-[var(--ds-color-text-primary)]">
              {MONTH_NAMES[month - 1]} {year}
            </h2>
            <Button onClick={nextMonth} variant="ghost" size="icon" className="text-[var(--ds-color-text-secondary)]">
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          <Card tone="elevated" padding="none" className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-[var(--ds-color-border-subtle)]">
              {WEEKDAYS.map((weekday) => (
                <div key={weekday} className="py-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--ds-color-text-muted)]">
                  {weekday}
                </div>
              ))}
            </div>

            {loading ? (
              <div className="py-20 text-center text-sm text-[var(--ds-color-text-muted)]">Carregando...</div>
            ) : (
              <div className="grid grid-cols-7">
                {grid.map((day, index) => {
                  const dateStr = day ? formatDate(year, month, day) : null;
                  const dayEvents = dateStr ? (eventsByDate[dateStr] ?? []) : [];
                  const isToday = dateStr === today;
                  const isSelected = day === selectedDay;

                  return (
                    <div
                      key={index}
                      onClick={() => day && setSelectedDay(day === selectedDay ? null : day)}
                      className={`min-h-[80px] border-b border-r border-[var(--ds-color-border-subtle)] p-1.5 transition-colors last:border-r-0 ${
                        day
                          ? `cursor-pointer ${isSelected ? 'bg-[var(--ds-color-primary-subtle)]/30' : 'hover:bg-[var(--ds-color-surface-muted)]/18'}`
                          : 'bg-[var(--ds-color-surface-muted)]/16'
                      }`}
                    >
                      {day && (
                        <>
                          <div
                            className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-sm font-medium ${
                              isToday
                                ? 'bg-[image:var(--ds-gradient-brand)] text-white'
                                : isSelected
                                  ? 'bg-[var(--ds-color-primary-subtle)] text-[var(--ds-color-action-primary)]'
                                  : 'text-[var(--ds-color-text-secondary)]'
                            }`}
                          >
                            {day}
                          </div>
                          <div className="space-y-0.5">
                            {dayEvents.slice(0, 3).map((event) => {
                              const color = EVENT_TYPE_COLOR[event.type];
                              return (
                                <div
                                  key={event.id}
                                  className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${color.bg} ${color.text}`}
                                  title={event.title}
                                >
                                  {event.title}
                                </div>
                              );
                            })}
                            {dayEvents.length > 3 && (
                              <div className="pl-1 text-[10px] text-[var(--ds-color-text-muted)]">+{dayEvents.length - 3} mais</div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <div className="mt-3 flex flex-wrap gap-3">
            {ALL_TYPES.map((type) => (
              <div key={type} className="flex items-center gap-1 text-xs text-[var(--ds-color-text-muted)]">
                <span className={`h-2.5 w-2.5 rounded-full ${EVENT_TYPE_COLOR[type].dot}`} />
                {EVENT_TYPE_LABEL[type]}
              </div>
            ))}
          </div>
        </div>

        <div className="w-72 shrink-0">
          <Card tone="elevated" padding="none" className="h-fit overflow-hidden">
            {selectedDay ? (
              <>
                <div className="border-b border-[var(--ds-color-border-subtle)] px-4 py-3">
                  <p className="font-semibold text-[var(--ds-color-text-primary)]">
                    {selectedDay} de {MONTH_NAMES[month - 1]}
                  </p>
                  <p className="text-xs text-[var(--ds-color-text-muted)]">
                    {selectedEvents.length} evento{selectedEvents.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="max-h-[520px] divide-y divide-[var(--ds-color-border-subtle)] overflow-y-auto">
                  {selectedEvents.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-[var(--ds-color-text-muted)]">Nenhum evento neste dia.</p>
                  ) : (
                    selectedEvents.map((event) => {
                      const color = EVENT_TYPE_COLOR[event.type];
                      return (
                        <div key={event.id} className="px-4 py-3">
                          <div className="flex items-start gap-2">
                            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${color.dot}`} />
                            <div className="min-w-0">
                              <p className="break-words text-sm font-medium leading-snug text-[var(--ds-color-text-primary)]">
                                {event.title}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                <Badge variant="primary" className={`${color.bg} ${color.text}`}>
                                  {EVENT_TYPE_LABEL[event.type]}
                                </Badge>
                                {event.subtype === 'vencimento' && <Badge variant="warning">Vencimento</Badge>}
                                {event.status && <Badge variant="neutral">{event.status}</Badge>}
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 pl-4">
                            <Link href={EVENT_TYPE_HREF[event.type]} className="text-[11px] text-[var(--ds-color-action-primary)] hover:underline">
                              Ver módulo →
                            </Link>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              <div className="px-4 py-8 text-center">
                <CalendarDays className="mx-auto mb-3 h-10 w-10 text-[var(--ds-color-text-muted)]/35" />
                <p className="text-sm text-[var(--ds-color-text-muted)]">Clique em um dia para ver os eventos</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
