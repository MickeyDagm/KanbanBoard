import React, { useState } from 'react';
import { format } from 'date-fns';
import { Calendar, CheckCircle2, Pencil } from 'lucide-react';
import type { Card, List, Priority } from '../../types';
import { PRIORITY_BADGE, PRIORITY_LABEL, guardOpen, isOverdue } from './viewMeta';

interface ListViewProps {
  lists: List[];
  cards: Card[];
  onOpenCard: (id: string) => void;
  onUpdateCard: (id: string, patch: Partial<Pick<Card, 'title' | 'priority' | 'done'>>) => void;
}

const ListView: React.FC<ListViewProps> = ({ lists, cards, onOpenCard, onUpdateCard }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const open = guardOpen(onOpenCard);

  const startEdit = (card: Card) => {
    setEditingId(card.id);
    setDraft(card.title);
  };

  const commit = () => {
    const title = draft.trim();
    if (editingId && title) onUpdateCard(editingId, { title });
    setEditingId(null);
  };

  return (
    <div data-testid="list-view" className="max-w-4xl space-y-6">
      {lists.map((list) => {
        const rows = cards
          .filter((c) => c.listId === list.id)
          .sort((a, b) => a.position - b.position);
        return (
          <section key={list.id} data-testid="list-view-group">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {list.title}
              </h3>
              <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
                {rows.length}
              </span>
            </div>

            {rows.length === 0 ? (
              <p className="text-sm text-slate-400 px-3 py-2">No cards</p>
            ) : (
              <ul className="space-y-1.5">
                {rows.map((card) => (
                  <li
                    key={card.id}
                    data-testid="list-view-row"
                    data-card-title={card.title}
                    onClick={() => open(card.id)}
                    className="group flex items-center gap-2 sm:gap-3 px-2.5 sm:px-3 py-2.5 sm:py-2 rounded-lg border border-transparent
                             hover:bg-white hover:border-slate-200 hover:shadow-sm cursor-pointer transition-all"
                  >
                    <button
                      type="button"
                      aria-label={card.done ? 'Mark not done' : 'Mark done'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateCard(card.id, { done: !card.done });
                      }}
                      className="text-slate-300 hover:text-emerald-600 transition-colors flex-shrink-0 p-0.5"
                    >
                      <CheckCircle2
                        className={`w-4 h-4 ${card.done ? 'text-emerald-600' : 'text-slate-300'}`}
                      />
                    </button>

                    <select
                      value={card.priority}
                      aria-label="Card priority"
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        onUpdateCard(card.id, { priority: e.target.value as Priority })
                      }
                      className={`text-[10px] sm:text-[11px] font-semibold uppercase rounded px-1.5 py-0.5 sm:py-1 border-0 outline-none cursor-pointer flex-shrink-0 ${
                        PRIORITY_BADGE[card.priority]
                      }`}
                    >
                      {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                        <option key={p} value={p}>
                          {PRIORITY_LABEL[p]}
                        </option>
                      ))}
                    </select>

                    {editingId === card.id ? (
                      <input
                        value={draft}
                        aria-label="Card title edit"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commit();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="flex-1 min-w-0 text-sm px-2 py-1 border border-blue-300 rounded
                                 outline-none focus:ring-2 focus:ring-blue-500/30"
                      />
                    ) : (
                      <span
                        className={`flex-1 min-w-0 text-sm truncate ${
                          card.done ? 'line-through text-slate-400' : 'text-slate-800'
                        }`}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          startEdit(card);
                        }}
                      >
                        {card.title}
                      </span>
                    )}

                    {card.dueDate && (
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] sm:text-xs flex-shrink-0 ${
                          isOverdue(card.dueDate) ? 'text-red-600 font-medium' : 'text-slate-500'
                        }`}
                      >
                        <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        {format(new Date(card.dueDate), 'MMM d')}
                      </span>
                    )}

                    {card.assignees.length > 0 && (
                      <span className="text-xs text-slate-500 hidden md:inline flex-shrink-0">
                        {card.assignees.map((a) => a.name).join(', ')}
                      </span>
                    )}

                    <button
                      aria-label="Rename card"
                      title="Rename card"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(card);
                      }}
                      className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-slate-400 hover:text-blue-600 p-1 flex-shrink-0"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
};

export default ListView;
