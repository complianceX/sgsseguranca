'use client';

import { useEffect, useState, useMemo } from 'react';
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

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const ALL_TYPES: CalendarEventType[] = [
  'training', 'medical_exam', 'dds', 'rdo', 'cat', 'service_order',
];

function buildCalendarGrid(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
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
  const [activeFilters, setActiveFilters] = useState<Set<CalendarEventType>>(
    new Set(ALL_TYPES),
  );

  useEffect(() => {
    setLoading(true);
    setSelectedDay(null);
    calendarService
      .getEvents(year, month)
      .then((res) => setEvents(res.data))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [year, month]);

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  function toggleFilter(type: CalendarEventType) {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  const filteredEvents = useMemo(
    () => events.filter(e => activeFilters.has(e.type)),
    [events, activeFilters],
  );

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of filteredEvents) {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }, [filteredEvents]);

  const grid = buildCalendarGrid(year, month);

  const today = formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate());

  const selectedDateStr = selectedDay ? formatDate(year, month, selectedDay) : null;
  const selectedEvents = selectedDateStr ? (eventsByDate[selectedDateStr] ?? []) : [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <CalendarDays className="h-7 w-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendário SST</h1>
          <p className="text-sm text-gray-500">Treinamentos, exames, DDS, RDOs, CATs e ordens de serviço</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {ALL_TYPES.map(type => {
          const color = EVENT_TYPE_COLOR[type];
          const active = activeFilters.has(type);
          return (
            <button
              key={type}
              onClick={() => toggleFilter(type)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                active
                  ? `${color.bg} ${color.text} border-transparent`
                  : 'bg-white text-gray-400 border-gray-200'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${active ? color.dot : 'bg-gray-300'}`} />
              {EVENT_TYPE_LABEL[type]}
            </button>
          );
        })}
      </div>

      <div className="flex gap-6">
        {/* Calendar */}
        <div className="flex-1 min-w-0">
          {/* Navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevMonth}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold text-gray-800">
              {MONTH_NAMES[month - 1]} {year}
            </h2>
            <button
              onClick={nextMonth}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Grid */}
          <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b border-gray-100">
              {WEEKDAYS.map(d => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            {loading ? (
              <div className="py-20 text-center text-gray-400 text-sm">Carregando...</div>
            ) : (
              <div className="grid grid-cols-7">
                {grid.map((day, idx) => {
                  const dateStr = day ? formatDate(year, month, day) : null;
                  const dayEvents = dateStr ? (eventsByDate[dateStr] ?? []) : [];
                  const isToday = dateStr === today;
                  const isSelected = day === selectedDay;

                  return (
                    <div
                      key={idx}
                      onClick={() => day && setSelectedDay(day === selectedDay ? null : day)}
                      className={`min-h-[80px] p-1.5 border-b border-r border-gray-100 last:border-r-0 transition-colors ${
                        day
                          ? `cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`
                          : 'bg-gray-50/50'
                      }`}
                    >
                      {day && (
                        <>
                          <div className={`flex h-6 w-6 items-center justify-center rounded-full text-sm font-medium mb-1 ${
                            isToday
                              ? 'bg-blue-600 text-white'
                              : isSelected
                              ? 'bg-blue-100 text-blue-700'
                              : 'text-gray-700'
                          }`}>
                            {day}
                          </div>
                          <div className="space-y-0.5">
                            {dayEvents.slice(0, 3).map(ev => {
                              const color = EVENT_TYPE_COLOR[ev.type];
                              return (
                                <div
                                  key={ev.id}
                                  className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${color.bg} ${color.text}`}
                                  title={ev.title}
                                >
                                  {ev.title}
                                </div>
                              );
                            })}
                            {dayEvents.length > 3 && (
                              <div className="text-[10px] text-gray-400 pl-1">
                                +{dayEvents.length - 3} mais
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-3">
            {ALL_TYPES.map(type => (
              <div key={type} className="flex items-center gap-1 text-xs text-gray-500">
                <span className={`h-2.5 w-2.5 rounded-full ${EVENT_TYPE_COLOR[type].dot}`} />
                {EVENT_TYPE_LABEL[type]}
              </div>
            ))}
          </div>
        </div>

        {/* Day detail panel */}
        <div className="w-72 shrink-0">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm h-fit">
            {selectedDay ? (
              <>
                <div className="border-b border-gray-100 px-4 py-3">
                  <p className="font-semibold text-gray-800">
                    {selectedDay} de {MONTH_NAMES[month - 1]}
                  </p>
                  <p className="text-xs text-gray-400">
                    {selectedEvents.length} evento{selectedEvents.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="divide-y divide-gray-50 max-h-[520px] overflow-y-auto">
                  {selectedEvents.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-gray-400 text-center">
                      Nenhum evento neste dia.
                    </p>
                  ) : (
                    selectedEvents.map(ev => {
                      const color = EVENT_TYPE_COLOR[ev.type];
                      return (
                        <div key={ev.id} className="px-4 py-3">
                          <div className="flex items-start gap-2">
                            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${color.dot}`} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-800 leading-snug break-words">
                                {ev.title}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${color.bg} ${color.text}`}>
                                  {EVENT_TYPE_LABEL[ev.type]}
                                </span>
                                {ev.subtype === 'vencimento' && (
                                  <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-700">
                                    Vencimento
                                  </span>
                                )}
                                {ev.status && (
                                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
                                    {ev.status}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 pl-4">
                            <Link
                              href={EVENT_TYPE_HREF[ev.type]}
                              className="text-[11px] text-blue-600 hover:underline"
                            >
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
                <CalendarDays className="mx-auto mb-3 h-10 w-10 text-gray-200" />
                <p className="text-sm text-gray-400">
                  Clique em um dia para ver os eventos
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
