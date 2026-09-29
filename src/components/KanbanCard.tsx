import React, { useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { Card, Priority } from '../types';

interface KanbanCardProps {
  card: Card;
  onOpen: (cardId: string) => void;
}

const PRIORITY_BADGE: Record<Priority, { label: string; cls: string } | null> = {
  NONE: null,
  LOW: { label: 'Low', cls: 'bg-sky-50 text-sky-600' },
  MEDIUM: { label: 'Med', cls: 'bg-amber-50 text-amber-600' },
  HIGH: { label: 'High', cls: 'bg-orange-50 text-orange-600' },
  URGENT: { label: 'Urgent', cls: 'bg-red-50 text-red-600' },
};

const KanbanCard: React.FC<KanbanCardProps> = ({ card, onOpen }) => {
  // Distance guard: dnd-kit fires a trailing click after a drag ends.
  const downPoint = useRef<{ x: number; y: number } | null>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priority = PRIORITY_BADGE[card.priority];
  const overdue = card.dueDate && new Date(card.dueDate) < new Date();
  const commentCount = card._count?.comments ?? 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onPointerDown={(e) => {
        downPoint.current = { x: e.clientX, y: e.clientY };
      }}
      onClick={(e) => {
        // Drag guard: dnd-kit fires a trailing click after a drag ends —
        // the release point would be far from where the pointer went down.
        const p = downPoint.current;
        downPoint.current = null;
        if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) return;
        // Optimistic card: the server hasn't assigned a real id yet.
        if (card.id.startsWith('temp-')) return;
        onOpen(card.id);
      }}
      className={`bg-white rounded-lg shadow-sm border border-gray-200 p-2 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all group ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      {/* Labels row (above title) */}
      {card.labels && card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {card.labels.map((label) => (
            <span
              key={label.id}
              className="px-2 h-5 inline-flex items-center text-xs rounded-full font-medium"
              style={{
                backgroundColor: `${label.color}1f`,
                color: '#334155',
                border: `1px solid ${label.color}59`,
              }}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      <h4 className="text-sm font-medium text-gray-900 leading-snug">{card.title}</h4>

      {card.description && (
        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{card.description}</p>
      )}

      {/* Meta footer */}
      {(priority ||
        card.dueDate ||
        commentCount > 0 ||
        card.assignees.length > 0) && (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {priority && (
            <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded uppercase ${priority.cls}`}>
              {priority.label}
            </span>
          )}
          {card.dueDate && (
            <span
              className={`inline-flex items-center gap-1 text-xs ${
                overdue ? 'text-red-600 font-medium' : 'text-gray-500'
              }`}
            >
              <Calendar className="w-3 h-3" />
              {format(new Date(card.dueDate), 'MMM d')}
            </span>
          )}
          {commentCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <MessageSquare className="w-3 h-3" />
              {commentCount}
            </span>
          )}
          <div className="flex-1" />
          {card.assignees.length > 0 && (
            <div className="flex -space-x-1.5">
              {card.assignees.slice(0, 4).map((a) => (
                <div
                  key={a.id}
                  className="w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-white text-[9px] font-semibold"
                  style={{ backgroundColor: a.avatarColor }}
                  title={a.name}
                >
                  {a.name?.charAt(0)?.toUpperCase()}
                </div>
              ))}
              {card.assignees.length > 4 && (
                <div className="w-5 h-5 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-slate-600 text-[9px] font-semibold">
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
