import React from 'react';
import { Calendar, CheckCircle2, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { Card, Priority } from '../types';

interface KanbanCardProps {
  card: Card;
  onOpen: (cardId: string) => void;
}

const PRIORITY_BADGE: Record<Priority, { label: string; cls: string } | null> = {
  NONE: null,
  LOW: { label: 'Low', cls: 'bg-sky-50 text-sky-700 border border-sky-200/60' },
  MEDIUM: { label: 'Med', cls: 'bg-amber-50 text-amber-700 border border-amber-200/60' },
  HIGH: { label: 'High', cls: 'bg-orange-50 text-orange-700 border border-orange-200/60' },
  URGENT: { label: 'Urgent', cls: 'bg-red-50 text-red-700 border border-red-200/60' },
};

const KanbanCard: React.FC<KanbanCardProps> = ({ card, onOpen }) => {
  const priority = PRIORITY_BADGE[card.priority];
  const overdue = card.dueDate && new Date(card.dueDate) < new Date();
  const commentCount = card._count?.comments ?? 0;

  return (
    <div
      onClick={() => {
        if (card.id.startsWith('temp-')) return;
        onOpen(card.id);
      }}
      className={`bg-white rounded-xl shadow-sm border p-3 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all group ${
        card.done ? 'border-emerald-200/90 bg-emerald-50/20' : 'border-slate-200/90'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4
          className={`text-sm font-medium leading-snug transition-colors ${
            card.done
              ? 'line-through text-slate-400 group-hover:text-emerald-700'
              : 'text-slate-800 group-hover:text-blue-600'
          }`}
        >
          {card.title}
        </h4>
        {card.done && (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-700 flex-shrink-0"
            title="Completed"
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Done
          </span>
        )}
      </div>

      {card.description && (
        <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{card.description}</p>
      )}

      {/* Meta footer */}
      {(priority ||
        card.dueDate ||
        commentCount > 0 ||
        card.assignees.length > 0) && (
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          {priority && (
            <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-md uppercase tracking-wider ${priority.cls}`}>
              {priority.label}
            </span>
          )}
          {card.dueDate && (
            <span
              className={`inline-flex items-center gap-1 text-xs ${
                overdue ? 'text-red-600 font-medium' : 'text-slate-500'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              {format(new Date(card.dueDate), 'MMM d')}
            </span>
          )}
          {commentCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <MessageSquare className="w-3.5 h-3.5" />
              {commentCount}
            </span>
          )}
          <div className="flex-1" />
          {card.assignees.length > 0 && (
            <div className="flex -space-x-1.5">
              {card.assignees.slice(0, 4).map((a) => (
                <div
                  key={a.id}
                  className="w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-white text-[9px] font-semibold shadow-xs"
                  style={{ backgroundColor: a.avatarColor }}
                  title={a.name}
                >
                  {a.name?.charAt(0)?.toUpperCase()}
                </div>
              ))}
              {card.assignees.length > 4 && (
                <div className="w-5 h-5 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-slate-600 text-[9px] font-semibold shadow-xs">
                  +{card.assignees.length - 4}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default KanbanCard;
