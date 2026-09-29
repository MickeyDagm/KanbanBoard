import React, { useMemo, useState } from 'react';
import { format, addMonths } from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Card } from '../../types';
import { PRIORITY_DOT, dayKey, dueDayKey, dueIsoForDay, guardOpen, isOverdue } from './viewMeta';

interface CalendarViewProps {
  cards: Card[];
  onOpenCard: (id: string) => void;
  onUpdateCard: (id: string, patch: Partial<Pick<Card, 'dueDate'>>) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CardChip: React.FC<{
  card: Card;
  onOpen: (id: string) => void;
}> = ({ card, onOpen }) => (
  <button
    data-testid="calendar-chip"
    data-card-title={card.title}
    onClick={() => onOpen(card.id)}
    className={`w-full text-left text-xs px-1.5 py-1 rounded border bg-white hover:border-blue-400
                hover:shadow-sm transition-colors flex items-center gap-1.5 ${
                  card.done
                    ? 'border-emerald-200 bg-emerald-50/30'
                    : isOverdue(card.dueDate)
                    ? 'border-red-300'
                    : 'border-slate-200'
                }`}
    title={card.title}
  >
    <span
      className="w-2 h-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: card.done ? '#10b981' : PRIORITY_DOT[card.priority] }}
    />
    <span className={`truncate ${card.done ? 'line-through text-slate-400' : 'text-slate-700'}`}>
      {card.title}
    </span>
  </button>
);

const CalendarView: React.FC<CalendarViewProps> = ({ cards, onOpenCard, onUpdateCard }) => {
  const [anchor, setAnchor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const open = guardOpen(onOpenCard);

  const days = useMemo(() => {
    const firstDay = anchor.getDay();
    const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    const total = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1 - firstDay);
    return Array.from({ length: total }, (_, i) =>
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    );
  }, [anchor]);

  const byDay = useMemo(() => {
    const map = new Map<string, Card[]>();
    for (const card of cards) {
      const key = dueDayKey(card);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(card);
      map.set(key, list);
    }
    return map;
  }, [cards]);

  const unscheduled = cards.filter((c) => !c.dueDate);

  const dropOn = (e: React.DragEvent, day: Date) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    onUpdateCard(card.id, { dueDate: dueIsoForDay(card.dueDate, day) });
  };

  const todayKey = dayKey(new Date());

  return (
    <div data-testid="calendar-view" className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800" data-testid="calendar-month">
            {format(anchor, 'MMMM yyyy')}
          </h3>
          <div className="flex items-center gap-1.5">
            <button
              aria-label="Today"
              onClick={() => {
                const now = new Date();
                setAnchor(new Date(now.getFullYear(), now.getMonth(), 1));
              }}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200
                       rounded-lg hover:bg-slate-50"
            >
              Today
            </button>
            <button
              aria-label="Previous month"
              onClick={() => setAnchor((a) => addMonths(a, -1))}
              className="p-1.5 text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              aria-label="Next month"
              onClick={() => setAnchor((a) => addMonths(a, 1))}
              className="p-1.5 text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="min-w-[560px] sm:min-w-0 grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden">
            {WEEKDAYS.map((d) => (
              <div key={d} className="bg-slate-50 px-2 py-1.5 text-[11px] font-semibold uppercase text-slate-500 text-center">
                {d}
              </div>
            ))}
            {days.map((day) => {
              const key = dayKey(day);
              const inMonth = day.getMonth() === anchor.getMonth();
              const dayCards = byDay.get(key) ?? [];
              return (
                <div
                  key={key}
                  data-date={key}
                  data-in-month={inMonth}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => dropOn(e, day)}
                  className={`min-h-[72px] sm:min-h-[92px] p-1 sm:p-1.5 bg-white ${inMonth ? '' : 'bg-slate-50/60'}`}
                >
                  <span
                    className={`text-xs font-medium mb-1 block ${
                      key === todayKey
                        ? 'text-white bg-blue-600 rounded-full w-5 h-5 text-center leading-5'
                        : inMonth
                          ? 'text-slate-600'
                          : 'text-slate-300'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  <div className="space-y-1">
                    {dayCards.map((card) => (
                      <CardChip key={card.id} card={card} onOpen={open} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <aside className="w-full lg:w-64 flex-shrink-0">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
          No due date ({unscheduled.length})
        </h3>
        <div data-testid="unscheduled" className="space-y-1.5">
          {unscheduled.length === 0 ? (
            <p className="text-xs text-slate-400">Every card is scheduled</p>
          ) : (
            unscheduled.map((card) => <CardChip key={card.id} card={card} onOpen={open} />)
          )}
        </div>
        <p className="mt-3 text-[11px] text-slate-400 flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5" />
          Drag a card onto a day to set its due date
        </p>
      </aside>
    </div>
  );
};

export default CalendarView;
