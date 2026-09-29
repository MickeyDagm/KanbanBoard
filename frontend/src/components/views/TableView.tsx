import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { Card, List } from '../../types';
import {
  PRIORITY_BADGE,
  PRIORITY_LABEL,
  type SortDir,
  type SortKey,
  compareBy,
  guardOpen,
  isOverdue,
} from './viewMeta';
import { format } from 'date-fns';

interface TableViewProps {
  lists: List[];
  cards: Card[];
  onOpenCard: (id: string) => void;
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'priority', label: 'Priority' },
  { key: 'due', label: 'Due' },
  { key: 'list', label: 'List' },
];

const TableView: React.FC<TableViewProps> = ({ lists, cards, onOpenCard }) => {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const open = guardOpen(onOpenCard);

  const listTitle = useMemo(() => {
    const map = new Map(lists.map((l) => [l.id, l.title]));
    return (id: string) => map.get(id) ?? '';
  }, [lists]);

  const sorted = useMemo(() => {
    const rows = [...cards];
    if (sort) rows.sort(compareBy(sort.key, sort.dir, listTitle));
    return rows;
  }, [cards, sort, listTitle]);

  const toggle = (key: SortKey) =>
    setSort((prev) =>
      prev && prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );

  const cell = 'px-3 py-2.5 text-left align-middle';

  return (
    <div data-testid="table-view" className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <table className="min-w-[560px] sm:min-w-[620px] w-full text-sm bg-white border border-slate-200 rounded-lg overflow-hidden">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {COLUMNS.map((col) => {
              const active = sort?.key === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={`${cell} text-xs font-semibold uppercase tracking-wide text-slate-500`}
                >
                  <button
                    onClick={() => toggle(col.key)}
                    className="inline-flex items-center gap-1 hover:text-slate-800"
                  >
                    {col.label}
                    {active &&
                      (sort.dir === 'asc' ? (
                        <ArrowUp className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5" />
                      ))}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((card) => (
            <tr
              key={card.id}
              data-testid="table-row"
              data-card-title={card.title}
              onClick={() => open(card.id)}
              className="border-b border-slate-100 last:border-0 hover:bg-blue-50/40 cursor-pointer"
            >
              <td className={`${cell} font-medium`}>
                <div className="flex items-center gap-2">
                  {card.done && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 flex-shrink-0">
                      Done
                    </span>
                  )}
                  <span className={card.done ? 'line-through text-slate-400' : 'text-slate-800'}>
                    {card.title}
                  </span>
                </div>
              </td>
              <td className={`${cell} text-slate-600`}>
                {card.assignees.length > 0 ? card.assignees.map((a) => a.name).join(', ') : '—'}
              </td>
              <td className={cell}>
                <span
                  className={`text-[11px] font-semibold uppercase rounded px-2 py-1 ${
                    PRIORITY_BADGE[card.priority]
                  }`}
                >
                  {PRIORITY_LABEL[card.priority]}
                </span>
              </td>
              <td className={cell}>
                {card.dueDate ? (
                  <span className={isOverdue(card.dueDate) ? 'text-red-600 font-medium' : 'text-slate-600'}>
                    {format(new Date(card.dueDate), 'MMM d, yyyy')}
                  </span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
              <td className={`${cell} text-slate-500`}>{listTitle(card.listId)}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="px-3 py-6 text-center text-slate-400">
                No cards match the current filters
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default TableView;
